// The controller owns the mix. Presentation gestures request the same toggle.
let soloIndex = -1;

function applySolo(index) {
    if (index === soloIndex) return;
    soloIndex = index;
    if (index < 0) return;
    entity.forEach((box, i) => {
        if (i !== index) {
            box.sound.silence();
            box.lastNote = -Infinity;
        }
    });
}

function toggleSolo(index) {
    if (!Number.isInteger(index) || index < 0 || index >= numberOfShownEntity) return;
    applySolo(soloIndex === index ? -1 : index);
    queueSetupSave();
}

// Intersect the tap ray with the actual chamber bounds after orbit and zoom.
function pickRoom(x, y) {
    if (!playback.pickMatrix) return -1;
    const inverse = playback.pickMatrix.inverse();
    const unproject = z => {
        const p = inverse.transformPoint({x:2*x/width-1, y:1-2*y/height, z, w:1});
        return [p.x/p.w, p.y/p.w, p.z/p.w];
    };
    const start = unproject(-1), end = unproject(1);
    let closest = Infinity, result = -1;
    for (const room of playback.targets) {
        let near = 0, far = 1;
        for (let axis = 0; axis < 3; axis++) {
            const delta = end[axis] - start[axis];
            const offset = room.center[axis] - start[axis], half = room.size[axis] / 2;
            if (Math.abs(delta) < 1e-9) {
                if (Math.abs(offset) > half) far = -1;
                continue;
            }
            const a = (offset - half) / delta, b = (offset + half) / delta;
            near = Math.max(near, Math.min(a,b));
            far = Math.min(far, Math.max(a,b));
        }
        if (near <= far && near < closest) { closest = near; result = room.i; }
    }
    return result;
}

function setupSoloInputs() {
    const request = i => {
        if (i < 0) return;
        if (isPresentation) lan.send({type:'solo', index:i});
        else toggleSolo(i);
    };
    window.addEventListener('keydown', e => {
        if (!/^[1-6]$/.test(e.key) || e.repeat || e.ctrlKey || e.altKey || e.metaKey ||
            e.target.closest?.('input,select,textarea,[contenteditable="true"]')) return;
        request(Number(e.key) - 1);
    });
    for (const id of ['stage', 'spectrum-plot']) {
        const el = document.getElementById(id);
        let tap;
        el.addEventListener('pointerdown', e => {
            tap = null;
            if (!e.isPrimary || e.button !== 0) return;
            const bounds = el.getBoundingClientRect();
            const x = e.clientX - bounds.left, y = e.clientY - bounds.top;
            const index = id === 'stage' ? pickRoom(x,y) : spectrumView.pick(x,y);
            tap = {id:e.pointerId, x:e.clientX, y:e.clientY, index};
        });
        el.addEventListener('pointermove', e => {
            if (tap && Math.hypot(e.clientX-tap.x, e.clientY-tap.y) > 8) tap = null;
        });
        el.addEventListener('pointercancel', () => { tap = null; });
        el.addEventListener('pointerup', e => {
            if (tap?.id === e.pointerId && Math.hypot(e.clientX-tap.x,e.clientY-tap.y) <= 8) request(tap.index);
            tap = null;
        });
    }
}
