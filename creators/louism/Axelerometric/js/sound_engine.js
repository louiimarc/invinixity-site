// The transport keeps beat phase across tempo changes. Collisions schedule
// voices in audio time so the note grid does not depend on the drawing FPS.
class BeatClock {
    constructor(bpm) {
        this.bpm = bpm;
        this.origin = 0;
        this.beat = 0;
    }
    beatAt(time) { return this.beat + (time - this.origin) * this.bpm / 60; }
    setTempo(bpm, time) {
        this.beat = this.beatAt(time);
        this.origin = time;
        this.bpm = bpm;
    }
    nextHit(time, grid) {
        if (!grid) return time;
        const beat = this.beatAt(time);
        return time + (Math.ceil(beat / grid) * grid - beat) * 60 / this.bpm;
    }
}

let bassSound;
let spatialOutput;

// Five direct interface outputs, or the standard 5.1 order with center unused.
const speakerLayouts = {
    direct: {channels:5, mains:[0,1,2,3], sub:4},
    surround: {channels:6, mains:[0,1,4,5], sub:3}
};

class SpatialOutput {
    constructor(context) {
        this.context = context;
        this.meter = context.createAnalyser();
        this.meter.fftSize = 256;
        this.wave = new Float32Array(this.meter.fftSize);
        this.select = document.getElementById('output-layout');
        this.trackingStatus = document.getElementById('tracking-status');
        this.select.querySelector('[value="tracked"]').disabled = !['localhost','127.0.0.1'].includes(location.hostname);
        const max = context.destination.maxChannelCount;
        for (const [mode, layout] of Object.entries(speakerLayouts)) {
            this.select.querySelector('[value="' + mode + '"]').disabled = max < layout.channels;
        }
        let saved;
        try { saved = localStorage.getItem('axelerometric.output'); } catch {}
        this.setMode(saved);
        this.select.onchange = () => {
            bassSound.silence();
            entity.forEach(box => box.sound.silence());
            this.setMode(this.select.value);
            try { localStorage.setItem('axelerometric.output', this.select.value); } catch {}
        };
    }

    setMode(mode) {
        const dest = this.context.destination;
        if (this.merger) this.merger.disconnect();
        this.merger = null;
        this.layout = speakerLayouts[mode];
        if (this.layout && dest.maxChannelCount >= this.layout.channels) {
            try {
                const merger = this.context.createChannelMerger(this.layout.channels);
                dest.channelCount = this.layout.channels;
                merger.connect(dest);
                this.merger = merger;
            } catch { /* A device change can invalidate its reported channel count. */ }
        }
        if (!this.merger && dest.maxChannelCount >= 2) dest.channelCount = 2;
        this.stopTracking();
        if (mode === 'tracked' && this.select.querySelector('[value="tracked"]').disabled) mode = 'headphones';
        this.headphones = mode === 'headphones' || mode === 'tracked';
        this.select.value = this.headphones || this.merger ? mode : 'stereo';
        if (mode === 'tracked') this.startTracking();
    }

    orient(axes) {
        const listener = this.context.listener;
        if (!listener.forwardX) { listener.setOrientation(...axes); return; }
        const params = [listener.forwardX, listener.forwardY, listener.forwardZ, listener.upX, listener.upY, listener.upZ];
        params.forEach((p, i) => { p.value = axes[i]; });
    }

    stopTracking() {
        clearTimeout(this.retryTracking);
        clearTimeout(this.poseTimeout);
        if (this.tracker) {
            this.tracker.onclose = this.tracker.onmessage = null;
            this.tracker.close();
            this.tracker = null;
            this.orient([0,0,-1,0,1,0]);
        }
        this.trackingStatus.hidden = true;
    }

    startTracking() {
        const status = this.trackingStatus;
        const waiting = () => {
            this.orient([0,0,-1,0,1,0]);
            status.textContent = 'Waiting for motion · Open Axelerometric Head Tracker on this Mac';
        };
        status.hidden = false;
        waiting();
        const ws = new WebSocket('ws://' + location.host + '/sync/head-listener');
        this.tracker = ws;
        ws.onmessage = event => {
            this.orient(JSON.parse(event.data));
            status.textContent = 'Head tracking active';
            clearTimeout(this.poseTimeout);
            this.poseTimeout = setTimeout(waiting, 1000);
        };
        ws.onclose = () => {
            waiting();
            this.retryTracking = setTimeout(() => this.startTracking(), 1500);
        };
    }

    level() {
        this.meter.getFloatTimeDomainData(this.wave);
        let sum = 0;
        for (const v of this.wave) sum += v*v;
        return Math.sqrt(sum / this.wave.length);
    }

    route(gain, position, kick) {
        const [x,y,z] = position;
        const horizontal = (x+1) * Math.PI/4;
        const depth = (1-z) * Math.PI/4;
        const left = Math.cos(horizontal), right = Math.sin(horizontal);
        const front = Math.cos(depth), rear = Math.sin(depth);
        const distance = 1 / Math.hypot(1, y);
        const nodes = [];
        const levels = [left*front, right*front, left*rear, right*rear];
        this.layout.mains.forEach((channel, i) => {
            const send = this.context.createGain();
            send.gain.value = levels[i] * distance;
            gain.connect(send);
            send.connect(this.merger, 0, channel);
            nodes.push(send);
        });
        if (kick) {
            const low = this.context.createBiquadFilter();
            low.type = 'lowpass';
            low.frequency.value = 80;
            low.Q.value = Math.SQRT1_2;
            gain.connect(low);
            low.connect(this.merger, 0, this.layout.sub);
            nodes.push(low);
        }
        gain.connect(this.meter);
        return nodes;
    }
}

class SoundEngine {
    constructor(context, output = p5.soundOut.input) {
        this.context = context;
        this.output = output;
        this.analyser = context.createAnalyser();
        this.analyser.smoothingTimeConstant = 0;
        this.sources = new Set();
        this.lastTime = -1;
    }

    play(voice, frequency, time, duration, pan, face, position = [pan,0,0]) {
        // Multiple wall contacts in one grid slot form one note per chamber.
        if (Math.abs(this.lastTime - time) < 0.001) return;
        this.lastTime = time;
        const ctx = this.context;
        const hat = voice === 'closed-hat';
        if (hat && !this.hatNoise) {
            this.hatNoise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.08), ctx.sampleRate);
            const data = this.hatNoise.getChannelData(0);
            let previous = 0;
            for (let i = 0; i < data.length; i++) {
                const noise = Math.random() * 2 - 1;
                data[i] = (noise - previous) * 0.5;
                previous = noise;
            }
        }
        const sample = hat ? this.hatNoise : samples.get(voice);
        if (voice.startsWith('file:') && !sample) return;
        const source = sample ? ctx.createBufferSource() : ctx.createOscillator();
        const kick = voice === 'kick';
        if (kick) {
            source.type = 'sine';
            source.frequency.setValueAtTime(138, time);
            source.frequency.exponentialRampToValueAtTime(frequency, time + 0.045);
            source.frequency.exponentialRampToValueAtTime(39, time + duration);
        } else if (sample) {
            source.buffer = sample;
            duration = hat ? Math.min(duration, sample.duration) : sample.duration;
        } else {
            source.type = voice;
            source.frequency.value = frequency;
        }
        const gain = ctx.createGain();
        const end = time + duration;
        if (sample && !hat) {
            // Imported one-shots keep the file's own attack and decay.
            gain.gain.value = 0.22;
        } else {
            gain.gain.setValueAtTime(0, time);
            const peak = kick ? 0.4 : hat ? 0.19 : 0.12;
            gain.gain.linearRampToValueAtTime(peak, time + Math.min(0.004, duration / 3));
            if (kick) gain.gain.exponentialRampToValueAtTime(0.11, time + duration * 0.48);
            gain.gain.exponentialRampToValueAtTime(0.0001, end);
        }
        source.connect(gain);
        let routes;
        if (spatialOutput.merger) {
            routes = spatialOutput.route(gain, position, kick);
            gain.connect(this.analyser);
        } else {
            // The chamber's +Y points down and +Z points to its marked front.
            // Web Audio's fixed listener faces -Z with +Y up.
            const panner = spatialOutput.headphones && !kick && !hat
                ? new PannerNode(ctx, {panningModel:'HRTF', positionX:position[0],
                    positionY:-position[1], positionZ:-position[2], rolloffFactor:0})
                : new StereoPannerNode(ctx, {pan});
            gain.connect(panner);
            panner.connect(this.output);
            panner.connect(this.analyser);
            routes = [panner];
        }
        this.sources.add(source);
        source.onended = () => {
            source.disconnect();
            gain.disconnect();
            for (const node of routes) node.disconnect();
            this.sources.delete(source);
        };
        source.start(time);
        source.stop(end);
    }

    silence() {
        for (const source of this.sources) source.stop();
        this.lastTime = -1;
    }
}
