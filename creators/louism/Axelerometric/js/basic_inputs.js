function setHatDivision(value) {
    if (!Number.isInteger(value)) return;
    hatPlane.division = Math.max(1, Math.min(6, value));
    hatPlane.lastStep = null;
    control('hat-division').value = hatPlane.division;
}

const clock = new BeatClock(108);
const scales = {
    Pentatonic: pentatonicScale, Major: majorScale, Minor: minorScale,
    'Harmonic minor': harmonicMinorScale, Insen: japaneseInsenScale,
    Blues: bluesScale, 'Whole tone': wholeToneScale, Diminished: diminishedScale,
    Slendro: slendroScale, Pelog: pelogScale
};
let activeScale = pentatonicScale;
const control = id => document.getElementById(id);

function setBoxCount(value) {
    const count = Math.max(0, Math.min(numberOfEntity, Math.round(value)));
    for (let i = count; i < numberOfShownEntity; i++) {
        entity[i].sound.silence();
        entity[i].lastNote = -Infinity;
    }
    if (soloIndex >= count) applySolo(-1);
    numberOfShownEntity = count;
    control('boxes').value = count;
    selectedChamber = Math.min(selectedChamber, Math.max(0, count - 1));
    const chamber = control('chamber');
    chamber.replaceChildren();
    for (let i = 0; i < count; i++) chamber.add(new Option('Box ' + (i + 1), i));
    chamber.value = selectedChamber;
    chamber.disabled = control('voice').disabled = !count;
    control('voice').value = entity[selectedChamber].voice;
}

async function toggleSound() {
    const button = control('transport');
    button.disabled = true;
    try {
        if (sounding) {
            sounding = false;
            bassSound.silence();
            entity.forEach(box => { box.sound.silence(); box.lastNote = -Infinity; });
        } else {
            await userStartAudio();
            sounding = getAudioContext().state === 'running';
            lastKickBeat = -1;
            hatPlane.lastStep = null;
            hatPlane.hitAt = -1;
            clock.origin = (nextFrame || playback.now() + lookahead) / 1000;
            clock.beat = 0;
        }
        button.textContent = sounding ? 'Mute sound' : 'Start sound';
    } catch {
        control('status').textContent = 'Audio could not start. Try Start sound again.';
    } finally {
        button.disabled = false;
    }
}

async function importAudio() {
    const files = Array.from(control('files').files);
    if (!files.length) return;
    control('files').value = '';
    control('import').disabled = true;
    let added = 0;
    const failed = [];
    const uncached = [];
    for (const file of files) {
        try {
            const buffer = await getAudioContext().decodeAudioData(await file.arrayBuffer());
            const key = sampleKey(file);
            samples.set(key, buffer);
            sampleOption(key, file.name);
            try { await cacheSample(file); } catch { uncached.push(file.name); }
            added++;
        } catch {
            failed.push(file.name);
        }
    }
    control('status').textContent = [
        added ? added + ' audio file(s) ready. Choose a chamber and voice.' : '',
        uncached.length ? 'Available until refresh only: ' + uncached.join(', ') : '',
        failed.length ? 'Could not decode ' + failed.join(', ') : ''
    ].filter(Boolean).join(' ');
    control('import').disabled = false;
}

function setRoomMotion(mode) {
    roomMotion.target = Number(mode === 'room');
    control('room-motion').value = mode;
}

function setupControls() {
    const transport = control('transport');
    transport.disabled = false;
    transport.onclick = toggleSound;
    for (const name of Object.keys(scales)) control('scale').add(new Option(name, name));
    for (const wave of ['sine','triangle','square','sawtooth']) {
        control('voice').add(new Option(wave[0].toUpperCase() + wave.slice(1), wave));
    }
    control('tempo').onchange = event => {
        const bpm = event.target.valueAsNumber;
        if (Number.isFinite(bpm)) {
            clock.setTempo(Math.max(30, Math.min(300, Math.round(bpm))), playback.now() / 1000);
        }
        event.target.value = clock.bpm;
    };
    control('room-motion').onchange = event => setRoomMotion(event.target.value);
    control('hat-division').onchange = event => setHatDivision(Number(event.target.value));
    control('grid').onchange = event => { hitGrid = Number(event.target.value); };
    control('scale').onchange = event => { activeScale = scales[event.target.value]; };
    control('boxes').onchange = event => {
        const value = event.target.valueAsNumber;
        setBoxCount(Number.isFinite(value) ? value : numberOfShownEntity);
    };
    control('chamber').onchange = event => {
        selectedChamber = Number(event.target.value);
        control('voice').value = entity[selectedChamber].voice;
    };
    control('voice').onchange = event => { entity[selectedChamber].voice = event.target.value; };
    control('import').onclick = () => control('files').click();
    control('files').onchange = importAudio;
    setBoxCount(numberOfShownEntity);
}

function keyPressed(event) {
    if (event.target.closest('input,select,textarea,[contenteditable="true"]') || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key.toLowerCase() === 'p') {
        if (!event.repeat) {
            setRoomMotion(roomMotion.target === 1 ? 'circle' : 'room');
            saveSetup();
        }
        return false;
    }
    if (event.target.closest('button')) return;
    switch (event.key.toLowerCase()) {
        case 'f': fullscreen(!fullscreen()); break;
        case 'r':
            for (const box of entity) {
                box.degree = floor(random(activeScale.length));
                box.sphere.hue = random(360);
                box.sphere.direction = p5.Vector.random3D();
            }
            break;
        case '-': case '_': setBoxCount(numberOfShownEntity - 1); break;
        case '=': case '+': setBoxCount(numberOfShownEntity + 1); break;
        default: return;
    }
    saveSetup();
    return false;
}
