let spectrumView;

class SpectrumView {
    constructor(analyser) {
        this.canvas = document.getElementById('spectrum-plot');
        this.ctx = this.canvas.getContext('2d');
        this.bins = new Uint8Array(analyser.frequencyBinCount);
        this.edges = [];
        const maxHz = Math.min(16000, analyser.context.sampleRate / 2);
        for (let i = 0; i <= 32; i++) {
            const hz = 40 * (maxHz / 40) ** (i / 32);
            this.edges.push(Math.min(this.bins.length - 1, Math.round(hz * analyser.fftSize / analyser.context.sampleRate)));
        }
        this.panels = [];
        this.history = entity.map(() => []);
    }

    pick(x, y) {
        const hits = this.panels.filter(p => x >= p.x && x <= p.x+p.side && y >= p.y && y <= p.y+p.side);
        if (!hits.length) return -1;
        const panel = hits[hits.length-1];
        if (this.mixed) return Math.min(this.panels.length-1, Math.floor((x-panel.x)/panel.side*this.panels.length));
        return panel.i;
    }

    draw(weights, merge, boxes, solo = -1) {
        this.panels.length = 0;
        this.mixed = merge > 0.98;
        const count = weights.length;
        const portrait = window.matchMedia('(orientation: portrait)').matches;
        // The first chamber in each row carries the same eased fade as its room.
        const visibleRows = (weights[0] ?? 0) + (weights[3] ?? 0);
        if (portrait && visibleRows !== this.visibleRows) {
            this.canvas.parentElement.style.setProperty('--spectrum-share', (100 * 1.3 / 8.6 * visibleRows) + '%');
            this.visibleRows = visibleRows;
        }
        for (let i = count; i < this.history.length; i++) this.history[i].length = 0;
        const width = this.canvas.clientWidth;
        const height = this.canvas.clientHeight;
        if (!width || !height) return;
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        if (this.canvas.width !== Math.round(width * ratio) || this.canvas.height !== Math.round(height * ratio)) {
            this.canvas.width = Math.round(width * ratio);
            this.canvas.height = Math.round(height * ratio);
        }
        const ctx = this.ctx;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.clearRect(0, 0, width, height);
        if (!count) return;

        const slots = Math.max(1, weights.reduce((sum, w) => sum + w, 0));
        const gap = Math.min(8, height / (slots * 8));
        const rows = Math.max(1, visibleRows);
        const side = portrait ? Math.min((width - 4 * gap) / 3, (height - (rows + 1) * gap) / rows)
            : Math.min(width - 2, (height - gap * (slots + 1)) / slots);
        if (side < 4) return;
        const middle = height / 2;
        const mixLeft = portrait ? (width - side) / 2 : 1;
        const labelBlend = Math.max(0, (merge - 0.75) * 4);
        ctx.font = '10px SyneMono, monospace';
        let consumed = 0;
        for (let i = 0; i < count; i++) {
            const box = entity[i];
            const weight = weights[i];
            const offset = (consumed + weight / 2 - slots / 2) * (side + gap);
            consumed += weight;
            const dx = portrait ? ((i % 3) - 1) * (side + gap) : 0;
            const dy = portrait ? (Math.floor(i / 3) - (rows - 1) / 2) * (side + gap) : offset;
            const top = middle + dy * (1 - merge) - side / 2;
            const left = mixLeft + dx * (1 - merge);
            this.panels.push({i, x:left, y:top, side});
            const alpha = weight * (solo < 0 || i === solo ? 1 : 0.16);
            ctx.save();
            ctx.translate(left, top);
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = ctx.fillStyle = 'hsl(' + boxes[i].hue + ' 56% 73%)';
            if (merge < 1 || i === 0) {
                ctx.save();
                ctx.strokeStyle = '#445364';
                ctx.strokeRect(0.5, 0.5, side - 1, side - 1);
                ctx.restore();
            }
            const inset = Math.min(7, side * 0.08);
            ctx.globalAlpha = alpha * (1 - labelBlend);
            ctx.fillText(String(i + 1).padStart(2, '0'), inset, inset + 9);
            ctx.globalAlpha = alpha;
            ctx.globalCompositeOperation = 'lighter';
            this.trace(box.sound.analyser, side, inset, this.history[i]);
            ctx.restore();
        }
        if (labelBlend > 0) {
            const inset = Math.min(7, side * 0.08);
            ctx.save();
            ctx.globalAlpha = labelBlend * Math.max(...weights);
            ctx.fillStyle = '#dceae9';
            ctx.fillText(solo < 0 ? 'MIX' : 'SOLO ' + (solo + 1), mixLeft + inset, middle + side / 2 - inset - 3);
            ctx.textAlign = 'center';
            for (let i = 0; i < count; i++) {
                ctx.fillStyle = 'hsl(' + boxes[i].hue + ' 56% 73%)';
                ctx.globalAlpha = labelBlend * weights[i] * (solo < 0 || solo === i ? 1 : 0.3);
                ctx.fillText(i + 1, mixLeft + (i + 0.5) * side / count, middle - side / 2 + inset + 9);
            }
            ctx.restore();
        }
    }

    trace(analyser, side, inset, history) {
        analyser.getByteFrequencyData(this.bins);
        const levels = [];
        for (let band = 0; band < this.edges.length - 1; band++) {
            let peak = this.bins[this.edges[band]];
            for (let k = this.edges[band] + 1; k < this.edges[band + 1]; k++) peak = Math.max(peak, this.bins[k]);
            levels.push(peak / 255);
        }

        const ctx = this.ctx;
        const span = side - 2 * inset;
        const base = side - inset;
        const amplitude = Math.max(1, span - 14);
        history.unshift(levels);
        if (history.length > 2) history.pop();
        const opacity = ctx.globalAlpha;
        for (let age = history.length - 1; age >= 0; age--) {
            ctx.globalAlpha = opacity * (age === 0 ? 1 : 0.14);
            ctx.lineWidth = age === 0 ? 1.6 : 1;
            ctx.beginPath();
            for (let band = 0; band < levels.length; band++) {
                const x = inset + band * span / (levels.length - 1);
                const y = base - amplitude * (history[age][band] * 0.96 + age * 0.04);
                if (band === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
    }
}
