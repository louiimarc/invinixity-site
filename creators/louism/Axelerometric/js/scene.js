// Both windows render the same buffered snapshots against the relay clock.
const playback = {
    frames: [],
    targets: [],
    focus: {x:0, y:0, scale:null, at:0},
    viewSphere: Object.create(BouncingSphere.prototype),
    now() { return performance.timeOrigin + performance.now() + lan.offset; },
    receive(frame) {
        this.frames.push(frame);
        if (this.frames.length > 16) this.frames.shift();
    },
    draw() {
        const time = this.now();
        while (this.frames.length > 1 && this.frames[1].at <= time) this.frames.shift();
        const a = this.frames[0];
        this.targets.length = 0;
        if (!a || time < a.at || time - a.at > 1500) return;
        const b = this.frames[1] || a;
        const t = b === a ? 0 : constrain((time - a.at) / (b.at - a.at), 0, 1);
        if (Number.isFinite(a.bassBeat)) {
            const beat = b.bassBeat >= a.bassBeat ? lerp(a.bassBeat, b.bassBeat, t) : a.bassBeat;
            const legFrame = Math.floor(beat) === Math.floor(b.bassBeat) ? b : a;
            const hitAt = b.planeHitAt <= time ? b.planeHitAt : a.planeHitAt;
            const flash = Math.max(0, 1 - (time - (hitAt ?? -1)) / 100);
            bassChamber.draw(beat, legFrame.hatDivision ?? 1, flash, time);
        }
        const merge = lerp(a.merge, b.merge, t);
        const weights = a.boxes.map((box, i) => lerp(box.opacity ?? 1, b.boxes[i]?.opacity ?? (b === a ? 1 : 0), t));
        const solo = a.solo ?? -1;
        spectrumView.draw(weights, merge, a.boxes, solo);
        roomFX.syncPanel();
        const count = a.boxes.length;
        const radius = a.radius === undefined ? (count > 1 ? 180 / Math.sin(Math.PI / count) : 0)
            : lerp(a.radius, b.radius ?? a.radius, t);
        const overviewScale = Math.min(width, height) / (count ? lerp(radius * 2 + 330, 300 * 1.85, merge) : 420);
        const masterFocused=!!a.master?.focused;
        const selected = masterFocused?{bounds:a.master.bounds,cx:0,cy:0}:a.boxes[solo];
        const nextSelected = masterFocused?selected:b.boxes[solo] || selected;
        const focus = this.focus;
        const dt = Math.min(100, Math.max(0, time - focus.at));
        const smooth = matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 1 - Math.exp(-dt / 150);
        const targetX = selected ? lerp(selected.cx || 0, nextSelected.cx || 0, t) : 0;
        const targetY = selected ? lerp(selected.cy || 0, nextSelected.cy || 0, t) : 0;
        const availableWidth = Math.max(width * 0.42, width - (width < 600 ? 140 : 240));
        const targetScale = selected ? Math.min(availableWidth / (selected.bounds.x * 1.65), height / (selected.bounds.y * 1.9)) : overviewScale;
        focus.x = lerp(focus.x, targetX, smooth);
        focus.y = lerp(focus.y, targetY, smooth);
        focus.scale = lerp(focus.scale ?? overviewScale, targetScale, smooth);
        focus.at = time;
        scale(focus.scale);
        translate(-focus.x, -focus.y, 0);
        const gl = window._renderer;
        this.pickMatrix = new DOMMatrix(gl.uPMatrix.mat4).multiply(new DOMMatrix(gl.uViewMatrix.mat4))
            .multiply(new DOMMatrix(gl.uModelMatrix.mat4));
        if(a.master) {
            const master=a.master,nextMaster=b.master||master,bounds=master.bounds;
            const point=master.p.map((v,i)=>lerp(v,nextMaster.p[i],t));
            const opacity=solo>=0?0.2:1;
            push();
            this.targets.push({i:-2,center:[0,0,0],size:[bounds.x,bounds.y,bounds.z]});
            for(const [shape,fx] of Object.entries(master.effects)) {
                roomFX.drawBarrier('master-'+shape,fx,bounds,point,
                    {slice:200,sphere:160,triangle:38}[shape],opacity,time);
            }
            noFill();stroke(175,182,190,opacity*255);strokeWeight(masterFocused?2:1.2);
            box(bounds.x,bounds.y,bounds.z);drawFrontMarker(bounds.x,bounds.y,bounds.z);
            push();translate(0,-bounds.y/2-18,0);noStroke();fill(200,206,215,opacity*255);
            textSize(12);text('MASTER FX',0,0);pop();
            translate(...point);noStroke();fill(230,233,238,opacity*255);sphere(8,16,12);
            pop();
        }
        if (merge > 0.75) {
            push();
            const opacity = Math.min(1, weights.reduce((sum, w) => sum + w, 0)) * (merge - 0.75) * 4;
            const ripples = b.ripples ?? a.ripples ?? [];
            roomTiles.draw(a.sharedY, solo < 0 ? ripples : ripples.filter(hit => hit.i === solo), time, opacity);
            noFill();
            stroke(151, 222, 207, 255 * opacity);
            strokeWeight(1.8);
            box(300, a.sharedY, 300);
            drawFrontMarker(300, a.sharedY, 300);
            pop();
        }
        for (let i = 0; i < count; i++) {
            const state = a.boxes[i];
            const next = b.boxes[i] || state;
            const angle = i * 2 * Math.PI / count - Math.PI / 2 + merge * Math.PI / 2;
            const sphere = this.viewSphere;
            sphere.position = {
                x: lerp(state.p[0], next.p[0], t),
                y: lerp(state.p[1], next.p[1], t),
                z: lerp(state.p[2], next.p[2], t)
            };
            sphere.radius = 8;
            sphere.hue = state.hue;
            sphere.waveform = state.waveform;
            const muted = masterFocused || solo >= 0 && i !== solo;
            sphere.flash = muted ? 0 : state.flash;
            sphere.faceGlow = state.glow;
            push();
            const cx = state.cx === undefined ? radius * (1 - merge) * Math.cos(angle) : lerp(state.cx, next.cx, t);
            const cy = state.cy === undefined ? radius * (1 - merge) * Math.sin(angle) : lerp(state.cy, next.cy, t);
            translate(cx, cy, 0);
            if (i < (a.activeCount ?? count)) {
                const {x,y,z} = sphere.position;
                this.targets.push(merge > 0.9 ? {i, center:[cx+x,cy+y,z], size:[30,30,30]} :
                    {i, center:[cx,cy,0], size:[state.bounds.x,state.bounds.y,state.bounds.z]});
            }
            const sliceFlash=Math.max(0,1-(time-(state.sliceHitAt??-1))/160);
            roomFX.drawBarrier(i,state.slice,state.bounds,[sphere.position.x,sphere.position.y,sphere.position.z],
                state.hue,weights[i]*(muted?0.12:0.65+sliceFlash*0.35),time);
            sphere.display(state.bounds, i, i === (solo < 0 ? a.selected : solo), merge,
                weights[i] * (muted ? 0.15 : 1), muted);
            pop();
        }
    }
};

function scheduleNote(note, engine, context) {
    const wait = (note.at - playback.now()) / 1000;
    if (wait < -0.05 || context.state !== 'running') return;
    engine.play(note.voice, note.freq, context.currentTime + Math.max(0, wait),
        note.duration, note.pan, note.face, note.position);
}
