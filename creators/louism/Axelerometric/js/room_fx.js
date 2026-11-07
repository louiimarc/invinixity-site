const roomEffectNames = {
    lowpass:'Low-pass', highpass:'High-pass', bandpass:'Band-pass',
    drive:'Drive', echo:'Echo', tremolo:'Tremolo'
};

const roomFXShapes = {slice:'Slice', sphere:'Sphere', triangle:'Irregular triangle'};
const finiteVector = (v, length) => Array.isArray(v) && v.length === length && v.every(Number.isFinite);

function validRoomFX(fx) {
    if (!fx || !Object.hasOwn(roomEffectNames, fx.type) || !finiteVector(fx.normal, 3) ||
        Math.abs(Math.hypot(...fx.normal) - 1) >= 0.01 ||
        !Number.isFinite(fx.offset) || Math.abs(fx.offset) > 0.8 ||
        !Number.isFinite(fx.thickness) || fx.thickness < 0.12 || fx.thickness > 0.6) return false;
    const shape = fx.shape || 'slice';
    if (!Object.hasOwn(roomFXShapes, shape)) return false;
    if (shape === 'slice') return true;
    if (!finiteVector(fx.center,3) || fx.center.some(v => Math.abs(v) > 0.3) ||
        !Number.isFinite(fx.radius) || fx.radius < 0.3 || fx.radius > 0.85) return false;
    if (shape === 'sphere') return true;
    if (!Array.isArray(fx.triangle) || fx.triangle.length !== 3 ||
        !fx.triangle.every(v => finiteVector(v,2) && v.every(x => Math.abs(x) <= 1))) return false;
    return Math.abs(triangleArea(fx.triangle)) > 0.1;
}

function triangleArea([a,b,c]) {
    return (b[1]-c[1])*(a[0]-c[0]) + (c[0]-b[0])*(a[1]-c[1]);
}

function chooseRoomFX(index, type) {
    if (index !== soloIndex || index < 0 || index >= numberOfShownEntity || !Object.hasOwn(roomEffectNames, type)) return;
    const box = entity[index];
    if (box.fx && box.fx.type !== type) return;
    const z = Math.random() * 2 - 1, angle = Math.random() * Math.PI * 2;
    const radius = Math.sqrt(1 - z * z);
    const shape = box.fxShape || box.fx?.shape || 'slice';
    box.fx = {type, shape, normal:[radius * Math.cos(angle), radius * Math.sin(angle), z],
        offset:(Math.random() * 2 - 1) * 0.55, thickness:0.12 + Math.random() * 0.48,
        revision:(box.fx?.revision || 0) + 1};
    if (shape !== 'slice') {
        box.fx.center = Array.from({length:3}, () => (Math.random()*2-1)*0.2);
        box.fx.radius = 0.4 + Math.random()*0.35;
        if (shape === 'triangle') {
            const triangle = [[-0.65-Math.random()*0.15,-0.4-Math.random()*0.1],
                [0.7+Math.random()*0.2,-0.3-Math.random()*0.1],[-0.2+Math.random()*0.3,0.7+Math.random()*0.2]];
            const center = [0,1].map(i => triangle.reduce((sum,v) => sum+v[i],0)/3);
            box.fx.triangle = triangle.map(v => v.map((x,i) => x-center[i]));
        }
    }
    roomFX.syncPanel(index, box.fx);
    queueSetupSave();
}

function changeRoomFXShape(index, shape) {
    if (index !== soloIndex || index < 0 || index >= numberOfShownEntity || !Object.hasOwn(roomFXShapes,shape)) return;
    const box = entity[index];
    box.fxShape = shape;
    if (box.fx) chooseRoomFX(index, box.fx.type);
    else { roomFX.syncPanel(index, null, shape); queueSetupSave(); }
}

// An orthonormal frame keeps the sphere round and the triangular prism's
// rotated geometry identical in the renderer and the audio hit test.
function roomFXFrame(fx, bounds) {
    const n = fx.normal;
    const seed = Math.abs(n[1]) < 0.9 ? [0,1,0] : [1,0,0];
    const u = [seed[1]*n[2]-seed[2]*n[1],seed[2]*n[0]-seed[0]*n[2],seed[0]*n[1]-seed[1]*n[0]];
    const length = Math.hypot(...u); u.forEach((x,i) => u[i]=x/length);
    const v = [n[1]*u[2]-n[2]*u[1],n[2]*u[0]-n[0]*u[2],n[0]*u[1]-n[1]*u[0]];
    return {n,u,v,unit:Math.min(bounds.x,bounds.y,bounds.z)/2,
        center:fx.center.map((x,i) => x*bounds[['x','y','z'][i]]/2)};
}

function clearRoomFX(index) {
    if (index !== soloIndex || index < 0 || index >= numberOfShownEntity) return;
    entity[index].fx = null;
    roomFX.syncPanel(index, null);
    queueSetupSave();
}

// Coordinates are normalized to the room, so MIDI resizing and room merging
// keep the audible zone aligned with the rendered slab.
function roomFXDepth(fx, point, bounds) {
    if (!validRoomFX(fx)) return 0;
    let depth;
    const shape = fx.shape || 'slice';
    if (shape === 'slice') {
        const signed = fx.normal.reduce((sum, n, i) => sum + n * point[i] / (bounds[['x','y','z'][i]] / 2), 0) - fx.offset;
        depth = Math.max(0, 1 - Math.abs(signed) / (fx.thickness / 2));
    } else {
        const frame = roomFXFrame(fx,bounds);
        const local = point.map((x,i) => (x-frame.center[i])/frame.unit);
        if (shape === 'sphere') depth = Math.max(0,1-Math.hypot(...local)/fx.radius);
        else {
            const dot = axis => local.reduce((sum,x,i) => sum+x*axis[i],0);
            const x = dot(frame.u)/fx.radius, y = dot(frame.v)/fx.radius;
            const [a,b,c] = fx.triangle, area = triangleArea(fx.triangle);
            const first = ((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/area;
            const second = ((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/area;
            depth = Math.max(0, Math.min(1, 3*Math.min(first,second,1-first-second),
                1-Math.abs(dot(frame.n))/(fx.thickness/2)));
        }
    }
    return depth * depth * (3 - 2 * depth);
}

// Clip a plane against all twelve cube edges, then sort its intersection polygon.
function slicePolygon(normal, offset) {
    const points = [];
    for (let axis = 0; axis < 3; axis++) {
        const others = [0,1,2].filter(i => i !== axis);
        for (const a of [-1,1]) for (const b of [-1,1]) {
            if (Math.abs(normal[axis]) < 1e-8) continue;
            const point = [0,0,0];
            point[others[0]] = a; point[others[1]] = b;
            point[axis] = (offset - normal[others[0]] * a - normal[others[1]] * b) / normal[axis];
            if (Math.abs(point[axis]) > 1 + 1e-7) continue;
            if (!points.some(p => p.every((v,i) => Math.abs(v - point[i]) < 1e-7))) points.push(point);
        }
    }
    if (points.length < 3) return [];
    const center = [0,1,2].map(i => points.reduce((s,p) => s + p[i], 0) / points.length);
    const u = points[0].map((v,i) => v - center[i]);
    const v = [normal[1]*u[2]-normal[2]*u[1], normal[2]*u[0]-normal[0]*u[2], normal[0]*u[1]-normal[1]*u[0]];
    const angle = p => Math.atan2(p.reduce((s,x,i) => s+(x-center[i])*v[i],0), p.reduce((s,x,i) => s+(x-center[i])*u[i],0));
    return points.sort((a,b) => angle(a)-angle(b));
}

const roomFX = {
    panel:null, signature:'', animations:new Map(), pending:null,
    setup() {
        const panel = document.createElement('section');
        panel.className = 'room-fx'; panel.hidden = true;
        panel.setAttribute('aria-label', 'Room audio effects');
        panel.innerHTML = '<div class="fx-heading"><span id="fx-room"></span><button type="button" data-action="back">All rooms ↗</button></div>' +
            '<div class="fx-bank fx-bank-left"></div><div class="fx-bank fx-bank-right"></div>' +
            '<div class="fx-footer"><div class="fx-shapes" role="group" aria-label="FX volume shape"></div><p id="fx-hint" role="status"></p><button type="button" data-action="clear" hidden>Clear FX</button></div>';
        Object.entries(roomEffectNames).forEach(([type,label], i) => {
            const button = document.createElement('button');
            button.type = 'button'; button.dataset.effect = type;
            button.textContent = label; button.setAttribute('aria-pressed','false');
            panel.querySelector(i < 3 ? '.fx-bank-left' : '.fx-bank-right').append(button);
        });
        for (const [shape,label] of Object.entries(roomFXShapes)) {
            const button = document.createElement('button');
            button.type = 'button'; button.dataset.shape = shape;
            button.textContent = label; button.setAttribute('aria-pressed','false');
            panel.querySelector('.fx-shapes').append(button);
        }
        panel.addEventListener('click', event => {
            const button = event.target.closest('button');
            if (!button || button.disabled) return;
            const index = soloIndex;
            if (button.dataset.action === 'back') {
                if (isPresentation) lan.send({type:'unsolo'}); else releaseSolo();
            } else if (button.dataset.action === 'clear') {
                this.pending = null;
                if (isPresentation) lan.send({type:'clear-fx', index}); else clearRoomFX(index);
            } else if (button.dataset.shape) {
                const shape = button.dataset.shape;
                if (isPresentation) {
                    this.pending = {index, type:entity[index]?.fx?.type, shape,
                        revision:entity[index]?.fx?.revision || 0, at:performance.now()};
                    this.syncPanel(index, entity[index]?.fx, shape);
                    lan.send({type:'room-fx-shape', index, shape});
                } else changeRoomFXShape(index, shape);
            } else if (button.dataset.effect) {
                const effect = button.dataset.effect;
                // Keep the lock visible while the controller's buffered frame catches up.
                if (isPresentation) this.pending = {index, type:effect,
                    revision:entity[index]?.fx?.revision || 0, shape:entity[index]?.fxShape || entity[index]?.fx?.shape || 'slice', at:performance.now()};
                this.syncPanel(index, {type:effect});
                if (isPresentation) lan.send({type:'room-fx', index, effect}); else chooseRoomFX(index, effect);
            }
        });
        document.getElementById('stage').append(panel);
        this.panel = panel;
    },
    syncPanel(index, fx, shape = fx?.shape || entity[index]?.fxShape || 'slice') {
        if (!this.panel) return;
        const pending = this.pending;
        if (pending) {
            if (index !== pending.index || performance.now() - pending.at > 2000 ||
                (shape === pending.shape && (pending.type ? fx?.type === pending.type && fx.revision > pending.revision : !fx))) this.pending = null;
            else { shape = pending.shape; fx = pending.type ? {type:pending.type, shape} : null; }
        }
        const signature = index + ':' + (fx?.type || '') + ':' + (fx?.revision || 0) + ':' + shape;
        if (signature === this.signature) return;
        this.signature = signature;
        this.panel.hidden = index < 0;
        if (index < 0) return;
        this.panel.querySelector('#fx-room').textContent = 'Room ' + String(index + 1).padStart(2,'0');
        for (const button of this.panel.querySelectorAll('[data-effect]')) {
            button.disabled = !!fx && button.dataset.effect !== fx.type;
            button.setAttribute('aria-pressed', String(button.dataset.effect === fx?.type));
        }
        for (const button of this.panel.querySelectorAll('[data-shape]')) button.setAttribute('aria-pressed', String(button.dataset.shape === shape));
        this.panel.querySelector('#fx-hint').textContent = fx
            ? roomEffectNames[fx.type] + ' · Tap again to reroll the barrier'
            : 'Choose one FX for this room';
        this.panel.querySelector('[data-action="clear"]').hidden = !fx;
    },
    drawBarrier(index, fx, bounds, point, hue, opacity, time) {
        if (!validRoomFX(fx)) { this.animations.delete(index); return; }
        const key = JSON.stringify(fx);
        let animation = this.animations.get(index);
        if (animation?.key !== key) {
            animation = {key, start:time}; this.animations.set(index, animation);
        }
        const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
        const entrance = reduced ? 1 : Math.min(1, Math.max(0, (time - animation.start) / 260));
        const alpha = opacity * entrance;
        const depth = roomFXDepth(fx, point, bounds);
        const half = fx.thickness / 2 * (0.3 + 0.7 * entrance);
        push();
        colorMode(HSB,360,100,100,1);
        stroke(hue,45,100,alpha * (0.4 + depth * 0.6));
        strokeWeight(1 + depth);
        fill(hue,55,95,alpha * (0.07 + depth * 0.2));
        const shape = fx.shape || 'slice';
        if (shape === 'sphere') {
            const frame = roomFXFrame(fx,bounds);
            translate(...frame.center);
            sphere(fx.radius*frame.unit*(0.3+0.7*entrance),24,16);
        } else if (shape === 'triangle') {
            const frame = roomFXFrame(fx,bounds);
            const vertices = [-half,half].map(z => fx.triangle.map(([x,y]) => frame.center.map((c,i) =>
                c + frame.unit*(frame.u[i]*x*fx.radius + frame.v[i]*y*fx.radius + frame.n[i]*z))));
            for (const face of vertices) {
                beginShape(); for (const point of face) vertex(...point); endShape(CLOSE);
            }
            for (let i=0;i<3;i++) {
                const next=(i+1)%3;
                beginShape();
                for (const point of [vertices[0][i],vertices[0][next],vertices[1][next],vertices[1][i]]) vertex(...point);
                endShape(CLOSE);
            }
        } else {
            for (const offset of [fx.offset-half, fx.offset+half]) {
                const polygon = slicePolygon(fx.normal, offset);
                beginShape();
                for (const p of polygon) vertex(p[0]*bounds.x/2,p[1]*bounds.y/2,p[2]*bounds.z/2);
                endShape(CLOSE);
            }
            // Normal line makes the slab thickness readable even when nearly edge-on.
            const endpoints = [-half,half].map(d => fx.normal.map(n => n * (fx.offset+d)));
            line(...endpoints[0].map((v,i) => v*bounds[['x','y','z'][i]]/2),
                 ...endpoints[1].map((v,i) => v*bounds[['x','y','z'][i]]/2));
        }
        pop();
    }
};
