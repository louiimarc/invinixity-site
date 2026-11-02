// Local Z points down the screen. Project a rotating square cross-section
// into a shallow ellipse so the side faces stay visible through a full turn.
const bassChamber = {
    canvas: document.getElementById('bass-chamber'),
    clear() {
        this.canvas.getContext('2d').clearRect(0, 0, this.canvas.width, this.canvas.height);
    },
    draw(beat, planeHeight, flash) {
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
        if (Number.isFinite(planeHeight)) {
            const marker = (1 - 2 * planeHeight) * (length / 2 - ball);
            ctx.beginPath();
            cap.forEach(([x,y], i) => {
                if (i === 0) ctx.moveTo(x, marker + y);
                else ctx.lineTo(x, marker + y);
            });
            ctx.closePath();
            ctx.strokeStyle = 'rgba(255,255,255,' + (0.38 + flash * 0.62) + ')';
            ctx.stroke();
            if (flash > 0) {
                ctx.fillStyle = 'rgba(255,255,255,' + flash * 0.75 + ')';
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
