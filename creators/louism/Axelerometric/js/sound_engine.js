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

// Every output channel passes through the same three shape slots. Processing
// after spatial panning keeps stereo/HRTF and discrete 4.1 channel placement.
class MasterFXBus {
    constructor(context,channels) {
        this.context=context;this.channels=channels;
        this.input=context.createGain();this.input.channelCount=channels;this.input.channelCountMode='explicit';
        this.output=context.createGain();this.output.channelCount=channels;this.output.channelCountMode='explicit';
        this.build();this.output.connect(context.destination);
    }
    build() {
        this.splitter=this.context.createChannelSplitter(this.channels);
        this.merger=this.context.createChannelMerger(this.channels);
        this.input.connect(this.splitter);this.chains=[];
        for(let i=0;i<this.channels;i++) {
            const gain=this.context.createGain();this.splitter.connect(gain,i);
            let node=gain;const inserts=[];
            for(let j=0;j<3;j++) {
                const insert=new RoomFXInsert(this.context,node);insert.update(null,0);
                inserts.push(insert);node=insert.output;
            }
            node.connect(this.merger,0,i);this.chains.push({gain,inserts});
        }
        this.merger.connect(this.output);
    }
    update(frame,at) {
        if(!frame)return;
        const when=this.context.currentTime+Math.max(0,(at-playback.now())/1000);
        const shapes=['slice','sphere','triangle'];
        for(const chain of this.chains) chain.inserts.forEach((insert,i)=>{
            const fx=frame.effects[shapes[i]];
            insert.update(fx,roomFXDepth(fx,frame.p,frame.bounds),when,{bpm:frame.bpm||108,beat:frame.beat||0});
        });
    }
    flush() {
        this.input.disconnect();this.splitter.disconnect();this.merger.disconnect();
        for(const chain of this.chains){chain.gain.disconnect();chain.inserts.forEach(insert=>insert.dispose());}
        this.build();
    }
    dispose() {
        this.input.disconnect();this.splitter.disconnect();this.merger.disconnect();this.output.disconnect();
        for(const chain of this.chains){chain.gain.disconnect();chain.inserts.forEach(insert=>insert.dispose());}
    }
}

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
            entity.forEach(box => {box.sound.silence();box.percussion.silence();});
            this.setMode(this.select.value);
            try { localStorage.setItem('axelerometric.output', this.select.value); } catch {}
        };
    }

    setMode(mode) {
        const dest = this.context.destination;
        if (this.merger) this.merger.disconnect();
        if (this.master) this.master.dispose();
        this.merger = null;
        this.layout = speakerLayouts[mode];
        if (this.layout && dest.maxChannelCount >= this.layout.channels) {
            try {
                const merger = this.context.createChannelMerger(this.layout.channels);
                dest.channelCount = this.layout.channels;
                // Route the discrete merger through the master bus below.
                this.merger = merger;
            } catch { /* A device change can invalidate its reported channel count. */ }
        }
        if (!this.merger && dest.maxChannelCount >= 2) dest.channelCount = 2;
        this.master=new MasterFXBus(this.context,this.merger?this.layout.channels:2);
        if(this.merger)this.merger.connect(this.master.input);
        this.master.output.connect(this.meter);
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
        return nodes;
    }
}

// Native filters/delay plus sample-accurate texture processing in each master slot.
class RoomFXInsert {
    static modules=new WeakMap();
    static crushCurve=Float32Array.from({length:65537},(_,i)=>Math.round((i/32768-1)*8)/8);
    static prepare(context) {
        if(!this.modules.has(context)) {
            const loading=context.audioWorklet
                ? context.audioWorklet.addModule(new URL('js/texture-worklet.js?v=1',location.href)).then(()=>true).catch(()=>false)
                : Promise.resolve(false);
            this.modules.set(context,loading);
        }
        return this.modules.get(context);
    }
    constructor(context,input) {
        this.context=context;
        this.filter=context.createBiquadFilter();this.filter.type='allpass';
        this.textureInput=context.createGain();this.textureOutput=context.createGain();
        // Keep sound available while the worklet loads, or on older/insecure browsers.
        this.crusher=context.createWaveShaper();this.crusher.curve=RoomFXInsert.crushCurve;
        this.dry=context.createGain();this.wet=context.createGain();this.wet.gain.value=0;
        this.textureInput.connect(this.dry);this.dry.connect(this.textureOutput);
        this.textureInput.connect(this.crusher);this.crusher.connect(this.wet);this.wet.connect(this.textureOutput);
        this.delay=context.createDelay(1);this.delay.delayTime.value=0.18;
        this.feedback=context.createGain();this.feedback.gain.value=0.28;
        this.echo=context.createGain();this.echo.gain.value=0;
        this.output=context.createGain();
        input.connect(this.filter);this.filter.connect(this.textureInput);
        this.textureOutput.connect(this.output);this.textureOutput.connect(this.delay);
        this.delay.connect(this.feedback);this.feedback.connect(this.delay);
        this.delay.connect(this.echo);this.echo.connect(this.output);
        this.nodes=[this.filter,this.textureInput,this.textureOutput,this.crusher,this.dry,this.wet,this.delay,this.feedback,this.echo,this.output];
        RoomFXInsert.prepare(context).then(ready=>{
            if(!ready||this.disposed||context.state==='closed')return;
            this.texture=new AudioWorkletNode(context,'axelerometric-texture',{
                numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1],channelCount:1,channelCountMode:'explicit'
            });
            this.textureInput.disconnect();this.dry.disconnect();this.crusher.disconnect();this.wet.disconnect();
            this.textureInput.connect(this.texture);this.texture.connect(this.textureOutput);
            this.nodes.push(this.texture);
            this.textureOutput.gain.cancelScheduledValues(context.currentTime);
            this.textureOutput.gain.value=1;
            if(this.latest)this.update(...this.latest);
        });
    }
    update(fx,depth,time=this.context.currentTime,transport={bpm:108,beat:0}) {
        time=Math.max(time,this.context.currentTime);
        this.latest=[fx,depth,time,transport];
        const type=fx?.type,amount=Math.max(0,Math.min(1,depth));
        const smooth=(param,value)=>{
            param.cancelScheduledValues(time);param.setTargetAtTime(value,time,0.025);
        };
        const filterType=['lowpass','highpass','bandpass'].includes(type)?type:'allpass';
        if(this.filter.type!==filterType)this.filter.type=filterType;
        const ceiling=Math.min(20000,this.context.sampleRate*0.45);
        smooth(this.filter.frequency,type==='lowpass'?ceiling*(350/ceiling)**amount:type==='highpass'?20*110**amount:1100);
        smooth(this.filter.Q,type==='bandpass'?0.001*2500**amount:0.707);
        smooth(this.echo.gain,type==='echo'?amount*0.5:0);
        if(this.texture) {
            smooth(this.texture.parameters.get('crushDepth'),type==='bitcrush'?amount:0);
            smooth(this.texture.parameters.get('gateDepth'),type==='stutter'?amount:0);
            for(const [name,value] of Object.entries({bpm:transport.bpm,beat:transport.beat,anchor:time})) {
                const param=this.texture.parameters.get(name);param.cancelScheduledValues(time);param.setValueAtTime(value,time);
            }
        } else {
            smooth(this.wet.gain,type==='bitcrush'?amount:0);
            smooth(this.dry.gain,type==='bitcrush'?1-amount:1);
            // Audio-rate worklet gating is preferred. This native fallback still
            // follows the beat and uses short ramps, without requiring analysis.
            const phase=((transport.beat*4)%1+1)%1;
            smooth(this.textureOutput.gain,type==='stutter'&&phase>=0.5?1-amount:1);
        }
    }
    dispose() {
        if(this.disposed)return;this.disposed=true;
        if(this.texture){this.texture.port.postMessage('dispose');this.texture.port.close();}
        this.nodes.forEach(node=>node.disconnect());
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
        const snare=voice==='snare';
        const hat = voice === 'closed-hat' || snare;
        if (hat && !this.hatNoise) {
            this.hatNoise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.16), ctx.sampleRate);
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
            const peak = kick ? 0.4 : snare ? 0.14 : hat ? 0.19 : 0.12;
            gain.gain.linearRampToValueAtTime(peak, time + Math.min(0.004, duration / 3));
            if (kick) gain.gain.exponentialRampToValueAtTime(0.11, time + duration * 0.48);
            gain.gain.exponentialRampToValueAtTime(0.0001, end);
        }
        source.connect(gain);
        const signal=gain;
        let routes;
        if (spatialOutput.merger) {
            routes = spatialOutput.route(signal, position, kick);
            signal.connect(this.analyser);
        } else {
            // The chamber's +Y points down and +Z points to its marked front.
            // Web Audio's fixed listener faces -Z with +Y up.
            const panner = spatialOutput.headphones && !kick && !hat
                ? new PannerNode(ctx, {panningModel:'HRTF', positionX:position[0],
                    positionY:-position[1], positionZ:-position[2], rolloffFactor:0})
                : new StereoPannerNode(ctx, {pan});
            signal.connect(panner);
            panner.connect(spatialOutput.master.input);
            panner.connect(this.analyser);
            routes = [panner];
        }
        this.sources.add(source);
        source.onended = () => {
            source.disconnect();gain.disconnect();
            for(const node of routes)node.disconnect();
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
