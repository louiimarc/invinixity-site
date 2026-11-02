// Local wall axes match the transforms below: (-Z,Y), (X,Z), and (X,Y).
const roomTiles = {
    size: 8,
    radius: 3.5,
    stepMs: 64,
    decayMs: 260,

    hit(face, point, bounds, hue, at) {
        const u = face < 2 ? -point.z / bounds.z : point.x / bounds.x;
        const v = face < 4 && face >= 2 ? point.z / bounds.z : point.y / bounds.y;
        const cell = n => Math.max(0, Math.min(this.size - 1, Math.floor((n + 0.5) * this.size)));
        return {face, col:cell(u), row:cell(v), hue, at};
    },

    get lifetime() { return this.radius * this.stepMs + this.decayMs; },

    draw(sharedY, ripples, time, opacity) {
        for (let face = 0; face < 6; face++) {
            const side = face % 2 === 0 ? -1 : 1;
            const wallHeight = face === 2 || face === 3 ? 300 : sharedY;
            push();
            if (face < 2) {
                translate(side * 150, 0, 0);
                rotateY(HALF_PI);
            } else if (face < 4) {
                translate(0, side * sharedY / 2, 0);
                rotateX(HALF_PI);
            } else {
                translate(0, 0, side * 150);
            }
            const w = 300 / this.size;
            const h = wallHeight / this.size;
            noStroke();
            colorMode(HSB, 360, 100, 100, 1);
            blendMode(ADD);
            for (const hit of ripples) {
                const age = time - hit.at;
                if (hit.face !== face || age < 0 || age >= this.lifetime) continue;
                beginShape(TRIANGLES);
                for (let row = 0; row < this.size; row++) {
                    for (let col = 0; col < this.size; col++) {
                        const distance = Math.hypot(col - hit.col, row - hit.row);
                        const elapsed = age - distance * this.stepMs;
                        if (distance > this.radius || elapsed < 0 || elapsed >= this.decayMs) continue;
                        const strength = (1 - elapsed / this.decayMs) ** 2 * (1 - distance / (this.radius + 1));
                        fill(hit.hue, 70, 100, strength * opacity);
                        const x = col * w - 150 + 1;
                        const y = row * h - wallHeight / 2 + 1;
                        const right = x + w - 2;
                        const bottom = y + h - 2;
                        vertex(x, y); vertex(right, y); vertex(right, bottom);
                        vertex(x, y); vertex(right, bottom); vertex(x, bottom);
                    }
                }
                endShape();
            }
            pop();
        }
    }
};
