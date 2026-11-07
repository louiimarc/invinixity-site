// Local Z points down the screen. Project a rotating square cross-section
// into a shallow ellipse so the side faces stay visible through a full turn.
const bassChamber = {
    canvas: document.getElementById('bass-chamber'),
    division: null,
    planes: [],
    transitionStart: 0,
    // Retarget from the currently visible planes so fast repeated changes stay smooth.
    animatePlanes(division, now) {
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const duration = reducedMotion ? 0 : 280;
        const progress = duration ? Math.min(1, Math.max(0, (now - this.transitionStart) / duration)) : 1;
        const eased = progress * progress * (3 - 2 * progress);
        const visible = this.planes.map(plane => ({
            position: plane.from + (plane.to - plane.from) * eased,
            opacity: plane.alphaFrom + (plane.alphaTo - plane.alphaFrom) * eased
        })).filter(plane => plane.opacity > 0.001);
        if (division === this.division) return visible;
        const initial = this.division === null;
        this.division = division;
        this.transitionStart = now;
        this.planes = visible.map(plane => ({
            from: plane.position, to: plane.position * 0.75,
            alphaFrom: plane.opacity, alphaTo: 0
        }));
        for (let i = 0; i < division; i++) {
            const position = 1 - 2 * (i + 0.5) / division;
            this.planes.push({from: initial ? position : position * 0.75, to: position,
                alphaFrom: initial ? 1 : 0, alphaTo: 1});
        }
        // Reduced motion switches immediately; the initial scene needs no entrance.
        if (reducedMotion || initial) {
            this.planes = this.planes.filter(plane => plane.alphaTo === 1)
                .map(plane => ({...plane, from:plane.to, alphaFrom:1}));
            return this.planes.map(plane => ({position:plane.to, opacity:1}));
        }
        return visible;
    },
    clear() {
        this.division = null;
        this.planes = [];
        this.canvas.getContext('2d').clearRect(0, 0, this.canvas.width, this.canvas.height);
    },
    draw(beat, division, flash, now = performance.now()) {
        const canvas = this.canvas;
        const w = canvas.clientWidth, h = canvas.clientHeight;
        if (!w || !h) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
        }
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        ctx.save();
        ctx.translate(w / 2, h / 2);
        const horizontal = window.matchMedia('(orientation: portrait)').matches;
        if (horizontal) ctx.rotate(Math.PI / 2);
        const breadth = horizontal ? h : w;
        const length = Math.min((horizontal ? w : h) * 0.66, breadth * 4);
        const radius = Math.min(breadth * 0.36, length * 0.18);
        const ball = Math.max(2, radius * 0.15);
        const beatIndex = Math.floor(beat);
        const phase = beat - beatIndex;
        const hitEnd = beatIndex % 2 === 0 ? 1 : -1;
        const angle = (beat % 32) * Math.PI / 16;
        const cap = [];
        for (let i = 0; i < 4; i++) {
            const a = angle + Math.PI / 4 + i * Math.PI / 2;
            cap.push([radius * Math.cos(a), radius * 0.36 * Math.sin(a)]);
        }
        ctx.strokeStyle = '#dbe0e6';
        ctx.lineWidth = 1;
        for (const end of [-1, 1]) {
            ctx.beginPath();
            cap.forEach(([x,y], i) => {
                const z = end * length / 2 + y;
                if (i === 0) ctx.moveTo(x, z);
                else ctx.lineTo(x, z);
            });
            ctx.closePath();
            if (end === hitEnd && phase < 0.2) {
                ctx.fillStyle = 'rgba(255,255,255,' + (1 - phase / 0.2) + ')';
                ctx.fill();
            }
            ctx.stroke();
        }
        ctx.beginPath();
        for (const [x,y] of cap) {
            ctx.moveTo(x, y - length / 2);
            ctx.lineTo(x, y + length / 2);
        }
        ctx.stroke();
        for (const plane of this.animatePlanes(division, now)) {
            const marker = plane.position * (length / 2 - ball);
            ctx.beginPath();
            cap.forEach(([x,y], i) => {
                if (i === 0) ctx.moveTo(x, marker + y);
                else ctx.lineTo(x, marker + y);
            });
            ctx.closePath();
            ctx.strokeStyle = 'rgba(255,255,255,' + ((0.38 + flash * 0.62) * plane.opacity) + ')';
            ctx.stroke();
            if (flash > 0) {
                ctx.fillStyle = 'rgba(255,255,255,' + flash * 0.75 * plane.opacity + ')';
                ctx.fill();
            }
        }
        const z = hitEnd * (1 - 2 * phase) * (length / 2 - ball);
        ctx.beginPath();
        ctx.arc(0, z, ball, 0, 2 * Math.PI);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.restore();
    }
};

// The controller owns subdivision changes, including gestures from viewers.
function setupPercussionInputs() {
    const change = delta => {
        if (isPresentation) lan.send({type:'hat-step', delta});
        else {
            setHatDivision(hatPlane.division + delta);
            queueSetupSave();
        }
    };
    window.addEventListener('keydown', event => {
        if (!['[', ']'].includes(event.key) || event.ctrlKey || event.metaKey || event.altKey ||
            event.target.closest?.('input,select,textarea,[contenteditable="true"]')) return;
        event.preventDefault();
        change(event.key === ']' ? 1 : -1);
    });
    const canvas = bassChamber.canvas;
    canvas.setAttribute('aria-label', 'Percussion chamber. Flick up to add subdivisions or down to subtract in landscape; right or left in portrait.');
    let flick;
    const clear = () => { flick = null; };
    canvas.addEventListener('pointerdown', event => {
        if (!event.isPrimary) { clear(); return; }
        if (event.pointerType !== 'touch') return;
        flick = {id:event.pointerId, x:event.clientX, y:event.clientY, at:performance.now(),
            portrait:matchMedia('(orientation: portrait)').matches};
        canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointercancel', clear);
    canvas.addEventListener('lostpointercapture', clear);
    canvas.addEventListener('pointerup', event => {
        const start = flick;
        clear();
        if (!start || start.id !== event.pointerId || performance.now() - start.at > 700) return;
        const dx = event.clientX - start.x, dy = event.clientY - start.y;
        const travel = start.portrait ? dx : -dy;
        const cross = start.portrait ? dy : dx;
        if (Math.abs(travel) >= 24 && Math.abs(travel) > Math.abs(cross) * 1.3) change(Math.sign(travel));
    });
}
