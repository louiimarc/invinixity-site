// One period of each oscillator, in phase (0–1) and amplitude (−1–1).
const wallWaveforms = {
    sine: Array.from({length:33}, (_, i) => [i / 32, Math.sin(i * Math.PI / 16)]),
    triangle: [[0,0], [0.25,1], [0.75,-1], [1,0]],
    square: [[0,-1], [0.25,-1], [0.25,1], [0.75,1], [0.75,-1], [1,-1]],
    sawtooth: [[0,0], [0.5,1], [0.5,-1], [1,0]]
};

class BouncingSphere {
    constructor(index) {
        this.position = createVector(random(-40,40), random(-40,40), random(-40,40));
        this.direction = p5.Vector.random3D();
        this.speed = 130 + index * 21; // World units per quarter note.
        this.hue = random(360);
        this.flash = 0;
        this.faceGlow = Array(6).fill(0);
        this.radius = 8;
    }

    update(beats, bounds, onHit) {
        let face = -1;
        // Capture the step before any axis reflects. At an edge or corner
        // each touched wall gets its own contact point and tile.
        const axes = ['x','y','z'];
        const travel = this.speed * beats;
        let startPoint, motion;
        if (onHit) {
            startPoint = {};
            motion = {};
            for (const axis of axes) {
                const limit = bounds[axis] / 2 - this.radius;
                startPoint[axis] = constrain(this.position[axis], -limit, limit);
                motion[axis] = this.direction[axis] * travel;
            }
        }
        for (let i = 0; i < this.faceGlow.length; i++) {
            this.faceGlow[i] = Math.max(0, this.faceGlow[i] - beats * 3);
        }
        for (const [i, axis] of axes.entries()) {
            const limit = bounds[axis] / 2 - this.radius;
            const start = constrain(this.position[axis], -limit, limit);
            let next = start + this.direction[axis] * travel;
            let distanceToHit = Math.abs(Math.sign(this.direction[axis]) * limit - start);
            // Reflect the overshoot as well, including in narrow MIDI boxes.
            while (Math.abs(next) > limit ||
                   (Math.abs(next) === limit && next * this.direction[axis] > 0 && travel > 0)) {
                const side = Math.sign(next);
                next = 2 * side * limit - next;
                this.direction[axis] *= -1;
                face = i * 2 + (side > 0 ? 1 : 0);
                this.faceGlow[face] = 1;
                if (onHit) {
                    const fraction = constrain(distanceToHit / Math.abs(motion[axis]), 0, 1);
                    const point = {};
                    for (const other of axes) {
                        const edge = bounds[other] / 2 - this.radius;
                        let value = startPoint[other] + motion[other] * fraction;
                        while (Math.abs(value) > edge) value = 2 * Math.sign(value) * edge - value;
                        point[other] = value;
                    }
                    onHit(face, point, fraction);
                    distanceToHit += 2 * limit;
                }
            }
            this.position[axis] = next;
        }
        this.flash = face >= 0 ? 1 : Math.max(0, this.flash - beats * 4);
        return face;
    }

    display(bounds, index, selected, merge, opacity = 1, muted = false) {
        push();
        colorMode(HSB, 360, 100, 100, 1);
        if (merge < 1) {
            if (!muted) this.drawHitFaces(bounds, opacity * (1 - merge) ** 2);
            noFill();
            stroke(this.hue, 48, 47 + (selected ? 8 : 0),
                   opacity * Math.min(1, (1 - merge) * 4));
            strokeWeight(selected ? 1.8 : 1);
            box(bounds.x, bounds.y, bounds.z);
            drawFrontMarker(bounds.y, bounds.z);
            const points = wallWaveforms[this.waveform];
            if (points && merge < 0.75) {
                const span = Math.min(bounds.x * 0.6, bounds.y * 1.5);
                stroke(this.hue, 48, 85, opacity * 0.8 * (1 - merge / 0.75));
                strokeWeight(1.5);
                beginShape();
                for (const [phase, amplitude] of points) {
                    vertex((phase - 0.5) * span, -amplitude * span * 0.16, -bounds.z / 2 + 0.6);
                }
                endShape();
            }
        }
        push();
        translate(this.position.x * merge,
                  lerp(-bounds.y / 2 - 16, this.position.y - 15, merge),
                  this.position.z * merge);
        noStroke();
        fill(this.hue, 32, 92, opacity);
        textSize(14);
        text(String(index + 1).padStart(2, '0'), 0, 0);
        pop();
        translate(this.position.x, this.position.y, this.position.z);
        noStroke();
        fill(this.hue, 62 * (1 - this.flash), 100, opacity);
        sphere(this.radius, 12, 8);
        pop();
    }

    drawHitFaces(bounds, opacity) {
        for (const [face, glow] of this.faceGlow.entries()) {
            if (glow === 0) continue;
            const side = face % 2 === 0 ? -1 : 1;
            push();
            noStroke();
            fill(this.hue, 65, 100, glow * opacity);
            if (face < 2) {
                translate(side * bounds.x / 2, 0, 0);
                rotateY(HALF_PI);
                plane(bounds.z, bounds.y);
            } else if (face < 4) {
                translate(0, side * bounds.y / 2, 0);
                rotateX(HALF_PI);
                plane(bounds.x, bounds.z);
            } else {
                translate(0, 0, side * bounds.z / 2);
                plane(bounds.x, bounds.y);
            }
            pop();
        }
    }
}

// Centered on the front floor edge, pointing out along local +Z.
function drawFrontMarker(boxHeight, depth) {
    const y = boxHeight / 2, z = depth / 2;
    beginShape();
    vertex(-6, y, z + 2);
    vertex(6, y, z + 2);
    vertex(0, y + 3, z + 14);
    endShape(CLOSE);
}
