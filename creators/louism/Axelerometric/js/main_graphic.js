const roomMotion = { progress: 0, target: 0 };
const lookahead = 150;
const stepMs = 1000 / 40;
let nextFrame;
let sceneCamera;
let lastKickBeat = -1;
const hatPlane = {division:1, lastStep:null, hitAt:-1};

function advancePlane(frame) {
    const division = hatPlane.division;
    frame.hatDivision = division;
    // Center each strike within its subdivision, away from the kick at the caps.
    const step = Math.floor(frame.bassBeat * division - 0.5 + 1e-9);
    if (step !== hatPlane.lastStep) {
        hatPlane.lastStep = step;
        const crossing = (step + 0.5) / division;
        const at = frame.at - (frame.bassBeat - crossing) * 60000 / clock.bpm;
        if (frame.at - at <= stepMs + 1) {
            hatPlane.hitAt = at;
            if (sounding) {
                frame.hat = {voice:'closed-hat', at, duration:0.065, pan:0.08};
                scheduleNote(frame.hat, bassSound, getAudioContext());
            }
        }
    }
    frame.planeHitAt = hatPlane.hitAt;
}
let wallRipples = [];
let wheelAngle = -Math.PI / 2;
const slotProgress = Array.from({length: numberOfEntity}, (_, i) => Number(i < numberOfShownEntity));

function ringRadius(slots) {
    if (slots <= 1) return 0;
    if (slots < 2) return 180 * (slots - 1);
    return 180 / Math.sin(Math.PI / slots);
}


function advanceRoom(beats) {
    const remaining = roomMotion.target - roomMotion.progress;
    roomMotion.progress += Math.sign(remaining) * Math.min(Math.abs(remaining), beats);
    const t = roomMotion.progress;
    return t * t * (3 - 2 * t);
}

function pumpSimulation() {
    const now = playback.now();
    if (!nextFrame || nextFrame < now || nextFrame > now + 1000) nextFrame = now + lookahead;
    while (nextFrame <= now + lookahead) {
        const beats = stepMs / 1000 * clock.bpm / 60;
        const merge = advanceRoom(beats);
        const count = numberOfShownEntity;
        wheelAngle = (wheelAngle + beats * 2 * Math.PI / 32) % (2 * Math.PI);
        const weights = slotProgress.map((value, i) => {
            const target = Number(i < count);
            const progress = value + constrain(target - value, -beats, beats);
            slotProgress[i] = progress;
            return progress * progress * (3 - 2 * progress);
        });
        const slots = weights.reduce((sum, weight) => sum + weight, 0);
        const radius = Math.max(285,ringRadius(slots)+70);
        let arc = 0;
        const cc = n => midi.getValue('cc', n) / 127;
        const heightCC = cc(27);
        const sharedY = 300 - 118 * heightCC;
        const frame = {at: nextFrame, merge, sharedY, radius, activeCount:count, solo:soloIndex, boxes: [], selected: selectedChamber, sounding, camera: sceneCamera};
        // Each quarter note lands on the opposite cap of the bass chamber.
        frame.bassBeat = clock.beatAt(nextFrame / 1000);
        advancePlane(frame);
        masterChamber.sphere.update(beats,masterChamber.bounds);
        frame.master={p:masterChamber.sphere.position.array(),bounds:masterChamber.bounds,
            bpm:clock.bpm,beat:frame.bassBeat,effects:masterChamber.effects,selectedShape:masterChamber.selectedShape,focused:masterFocused};
        spatialOutput.master.update(frame.master,nextFrame);
        const beat = Math.ceil(frame.bassBeat);
        const delay = (beat - frame.bassBeat) * 60000 / clock.bpm;
        if (sounding && beat !== lastKickBeat && delay < stepMs) {
            lastKickBeat = beat;
            frame.kick = {voice:'kick', at:nextFrame + delay, duration:Math.min(0.42, 48 / clock.bpm), freq:46, pan:0};
            scheduleNote(frame.kick, bassSound, getAudioContext());
        }
        wallRipples = merge > 0.75 ? wallRipples.filter(hit => nextFrame - hit.at < roomTiles.lifetime) : [];
        const notes = [];
        for (let i = 0; i < weights.length; i++) {
            const opacity = weights[i];
            if (!opacity) break;
            // Each chamber owns an arc proportional to its visibility.
            const angle = wheelAngle + (arc + (opacity - weights[0]) / 2) * 2 * Math.PI / slots + merge * Math.PI / 2;
            arc += opacity;
            const cx = radius * (1 - merge) * Math.cos(angle);
            const cy = radius * (1 - merge) * Math.sin(angle);
            const {sphere, voice, degree} = entity[i];
            const local = {x:210 - 158 * cc(21 + i), y:170 - 118 * heightCC, z:180 - 128 * cc(41 + i)};
            const bounds = {x:lerp(local.x, 300, merge), y:lerp(local.y, sharedY, merge), z:lerp(local.z, 300, merge)};
            // Map the simulated ball's travel to the drawn walls, including its radius.
            const displayCoordinate = (point, axis) => point[axis] * (bounds[axis]/2 - sphere.radius) /
                (local[axis]/2 - sphere.radius);
            let impact;
            const slice=entity[i].slice;
            const signed=point=>slice.normal.reduce((sum,n,j)=>sum+n*point[['x','y','z'][j]]/(local[['x','y','z'][j]]/2),0)-slice.offset;
            const before=signed(sphere.position);
            const face = sphere.update(beats, local, (face, point, fraction) => {
                impact = point;
                if (merge <= 0.75 || i >= count) return;
                const tilePoint = {x:cx + displayCoordinate(point,'x'), y:cy + displayCoordinate(point,'y'),
                    z:displayCoordinate(point,'z')};
                wallRipples.push({i, ...roomTiles.hit(face, tilePoint, {x:300, y:sharedY, z:300}, sphere.hue,
                    nextFrame - (1 - fraction) * stepMs)});
            });
            const p = ['x','y','z'].map(axis => displayCoordinate(sphere.position, axis));
            const waveform = Object.hasOwn(wallWaveforms, voice) ? voice : undefined;
            frame.boxes.push({cx, cy, opacity, p, bounds, waveform, slice, sliceHitAt:entity[i].sliceHitAt, hue:sphere.hue, flash:sphere.flash, glow:sphere.faceGlow.slice()});
            const after=signed(sphere.position);
            if(i<count && before*after<0) {
                const fraction=Math.abs(before)/(Math.abs(before)+Math.abs(after));
                const at=nextFrame-(1-fraction)*stepMs;
                entity[i].sliceHitAt=at;
                frame.boxes[frame.boxes.length-1].sliceHitAt=at;
                if(sounding && (soloIndex<0 || i===soloIndex)) {
                    const note={i,voice:'snare',at:clock.nextHit(at/1000,hitGrid)*1000,
                        duration:0.12,pan:constrain(p[0]/(bounds.x/2),-1,1),
                        position:p.map((v,j)=>constrain(v/(bounds[['x','y','z'][j]]/2),-1,1))};
                    scheduleNote(note,entity[i].percussion,getAudioContext());notes.push(note);
                }
            }
            if (i >= count || face < 0 || !sounding || (soloIndex >= 0 && i !== soloIndex)) continue;
            const pitch = degree + face;
            const position = ['x','y','z'].map(axis => constrain(impact[axis] / (local[axis]/2 - sphere.radius), -1, 1));
            const note = {
                i, face, voice,
                at: clock.nextHit(nextFrame / 1000, hitGrid) * 1000,
                duration: 60 / clock.bpm,
                freq: activeScale[pitch % activeScale.length] * 2 ** (Math.floor(pitch / activeScale.length) - 1) * (1 + heightCC * 9),
                position, pan: position[0]
            };
            if (Math.abs(entity[i].lastNote - note.at) < 1) continue;
            entity[i].lastNote = note.at;
            scheduleNote(note, entity[i].sound, getAudioContext());
            notes.push(note);
        }
        frame.ripples = wallRipples.slice();
        playback.receive(frame);
        lan.send({type:'frame', frame, notes});
        nextFrame += stepMs;
    }
}

function draw() {
    background(9, 15, 30);
    orbitControl();
    const camera = this._renderer._curCamera;
    sceneCamera = [camera.eyeX, camera.eyeY, camera.eyeZ, camera.centerX, camera.centerY, camera.centerZ]
        .map(v => v / height).concat(camera.upX, camera.upY, camera.upZ);
    if (frameCount % 4 === 0) control('level').value = spatialOutput.level();
    pumpSimulation();
    playback.draw();
}
