class SoundEngine {
    constructor(waveType = 'sine', adsrValues = [ 0.0, 0.125, 0.8, 0.0625 ],
                reverbValues = [ 3, 1, 0.8 ]) {

        this.frequency = 2048;
        this.volume = 0.8;

        this.oscillator = new p5.Oscillator(waveType);

        this.envelope = new p5.Envelope();
        this.envelope.setADSR(adsrValues[0], adsrValues[1], adsrValues[2],
                              adsrValues[3]);

        this.oscillator.disconnect();
        this.oscillator.amp(this.envelope);
        this.oscillator.start();

        this.panner = new p5.Panner3D();
        this.panner.panner.panningModel = 'HRTF';
        this.panner.panner.distanceModel = 'exponential';
        this.panner.process(this.oscillator);
        this.panner.disconnect();

        this.reverb = new p5.Reverb();
        this.reverb.set(reverbValues[0], reverbValues[1]);
        this.reverb.drywet(reverbValues[2]);

        this.reverb.process(this.panner);
        this.reverb.amp(this.volume);

        this.isTriggered = false;
    }

    setFrequency(freqValue) {
        this.frequency = freqValue;
        this.oscillator.freq(this.frequency);
    }

    setVolume(volValue) {
        this.volume = volValue;
        this.reverb.amp(this.volume);
    }

    setPannerPosition(x, y, z) { this.panner.set(x, y, z); }

    triggerSound(triggerValue) {
        if (triggerValue && !this.isTriggered) {
            this.envelope.play();
            this.isTriggered = true;
        } else if (!triggerValue && this.isTriggered) {
            this.isTriggered = false;
        }
    }
}

class UiSoundEngine {
  constructor(voiceCount = 6) {
    this.voiceCount = voiceCount;
    this.voices = [];
    this.nextVoice = 0;
    this.step = 0;
    this.scale = [0, 2, 4, 7, 9, 12];
    this.buttonOffsets = {
      save: 0,
      edit: 1,
      done: 3,
    };
    this.sliderPositions = {};
    this.dialPositions = {};
    this.xyVoices = [];
    this.xyFrequencies = [130.81, 196, 293.66, 329.63];
    this.xyControl = null;
    this.xyPosition = { x: 0.5, y: 0.5, pointerX: 0.5 };
    this.xyLastPosition = null;
    this.xyLastMoveAt = 0;
    this.xyMotion = 0;
    this.xyMotionTarget = 0;
    this.xyTravel = 0;
    this.textSelectionPosition = null;
  }

  createVoices() {
    if (this.voices.length > 0) return;

    for (let i = 0; i < this.voiceCount; i++) {
      let oscillator = new p5.Oscillator("triangle");
      let envelope = new p5.Envelope();
      oscillator.amp(0);
      oscillator.start();
      oscillator.amp(envelope);
      this.voices.push({ oscillator, envelope });
    }
  }

  createXyVoices() {
    if (this.xyVoices.length > 0) return;
    for (let frequency of this.xyFrequencies) {
      let oscillator = new p5.Oscillator("sine");
      oscillator.amp(0);
      oscillator.freq(frequency);
      oscillator.start();
      this.xyVoices.push(oscillator);
    }
  }

  tap(button = "edit", pointerX = 0.5) {
    this.createVoices();

    let offset = this.buttonOffsets[button] ?? 0;
    let degree = this.scale[(this.step + offset) % this.scale.length];
    let detune = random(-8, 8);
    let frequency = 440 * pow(2, (60 + degree - 69 + detune / 100) / 12);
    let durationVariation = random(0.9, 1.1);

    this.playTone({
      frequency,
      startRatio: 0.78,
      attack: 0.002,
      decay: 0.045 * durationVariation,
      release: 0.035 * durationVariation,
      level: 0.055,
      ramp: 0.03 * durationVariation,
      pointerX,
      waveType: "triangle",
    });

    this.step = (this.step + 1) % this.scale.length;
  }

  countdown(step = 0, scaleName = "major", pointerX = 0.5) {
    let scales = {
      major: [0, 2, 4],
      harmonic: [0, 4, 7],
      harmonicMinor: [0, 3, 11],
    };
    let scale = scales[scaleName] || scales.major;
    let semitones = scale[constrain(step, 0, scale.length - 1)];
    let frequency = 261.63 * pow(2, semitones / 12);
    this.playTone({
      frequency,
      startRatio: 0.98,
      attack: 0.002,
      decay: 0.1,
      release: 0.04,
      level: 0.07,
      ramp: 0.01,
      pointerX,
      waveType: "sine",
    });
  }

  slide(control, value, pointerX = 0.5) {
    let step = round(constrain(value, 0, 1) * 15);
    if (this.sliderPositions[control] == step) return;
    this.sliderPositions[control] = step;

    let pentatonic = [0, 2, 4, 7, 9];
    let midi = 48 + pentatonic[step % pentatonic.length] +
      floor(step / pentatonic.length) * 12;
    let frequency = 440 * pow(2, (midi - 69 + random(-6, 6) / 100) / 12);

    this.playTone({
      frequency,
      startRatio: 0.9,
      attack: 0.001,
      decay: 0.02,
      release: 0.014,
      level: 0.028,
      ramp: 0.012,
      pointerX,
      waveType: "triangle",
    });
  }

  dial(control, value, pointerX = 0.5) {
    let step = floor((((value % 1) + 1) % 1) * 16);
    if (this.dialPositions[control] == step) return;
    this.dialPositions[control] = step;

    this.playTone({
      frequency: 523.25,
      startRatio: 0.9,
      attack: 0.001,
      decay: 0.02,
      release: 0.014,
      level: 0.028,
      ramp: 0.012,
      pointerX,
      waveType: "triangle",
    });
  }

  xyPad(control, x, y, pointerX = 0.5) {
    x = constrain(x, 0, 1);
    y = constrain(y, 0, 1);
    let starting = this.xyControl != control;
    let now = millis() / 1000;

    this.createXyVoices();
    this.xyControl = control;
    this.xyPosition = { x, y, pointerX };

    if (starting) this.xyTravel = 0;

    if (!starting && this.xyLastPosition != null) {
      let elapsed = max(1 / 120, now - this.xyLastPosition.time);
      let movement = dist(
        this.xyLastPosition.x,
        this.xyLastPosition.y,
        x,
        y,
      );
      this.xyTravel += movement;
      this.xyMotionTarget = max(
        this.xyMotionTarget,
        constrain(movement / elapsed / 3, 0, 1),
      );
    }

    this.xyLastPosition = { x, y, time: now };
    this.xyLastMoveAt = now;
    for (let oscillator of this.xyVoices) {
      oscillator.pan(constrain(pointerX * 2 - 1, -0.7, 0.7));
    }
  }

  update() {
    if (this.xyControl == null || this.xyVoices.length == 0) return;

    let now = millis() / 1000;
    let target = now - this.xyLastMoveAt < 0.08
      ? this.xyMotionTarget
      : 0;
    this.xyMotion = lerp(
      this.xyMotion,
      target,
      target > this.xyMotion ? 0.4 : 0.16,
    );
    this.xyMotionTarget *= 0.82;

    let x = this.xyPosition.x;
    let y = this.xyPosition.y;
    let weights = [
      (1 - x) * (1 - y),
      x * (1 - y),
      (1 - x) * y,
      x * y,
    ];
    let amplitude = this.xyMotion * 0.018;
    for (let i = 0; i < this.xyVoices.length; i++) {
      this.xyVoices[i].amp(sqrt(weights[i]) * amplitude, 0.035);
    }
  }

  playXyChord(x, y, pointerX = 0.5) {
    let weights = [
      (1 - x) * (1 - y),
      x * (1 - y),
      (1 - x) * y,
      x * y,
    ];

    for (let i = 0; i < this.xyFrequencies.length; i++) {
      if (weights[i] < 0.0001) continue;
      this.playTone({
        frequency: this.xyFrequencies[i],
        startRatio: 0.96,
        attack: 0.003,
        decay: 0.09,
        release: 0.04,
        level: sqrt(weights[i]) * 0.025,
        ramp: 0.02,
        pointerX,
        waveType: "sine",
      });
    }
  }

  textSelection(start, end, total, pointerX = 0.5) {
    let signature = `${start}:${end}:${total}`;
    if (this.textSelectionPosition == signature) return;
    this.textSelectionPosition = signature;

    let selected = abs(end - start);
    let selectionRatio = constrain(selected / max(1, total), 0, 1);
    this.playTone({
      frequency: lerp(260, 780, selectionRatio),
      startRatio: selected == 0 ? 1.2 : 0.9,
      attack: 0.001,
      decay: 0.024,
      release: 0.018,
      level: 0.025,
      ramp: 0.014,
      pointerX,
      waveType: "triangle",
    });
  }

  panelSnap(fromDetent, toDetent, pointerX = 0.5) {
    let frequencies = [110, 138.59, 164.81];
    let direction = Math.sign(toDetent - fromDetent);
    this.playTone({
      frequency: frequencies[toDetent] || frequencies[0],
      startRatio: direction > 0 ? 0.76 : direction < 0 ? 1.3 : 1.12,
      attack: 0.001,
      decay: 0.035,
      release: 0.025,
      level: 0.035,
      ramp: 0.025,
      pointerX,
      waveType: "triangle",
    });
  }

  endControl(control) {
    delete this.sliderPositions[control];
    delete this.dialPositions[control];
    if (this.xyControl == control && this.xyVoices.length > 0) {
      let tapped = this.xyTravel < 0.04;
      let position = { ...this.xyPosition };
      for (let oscillator of this.xyVoices) oscillator.amp(0, 0.12);
      this.xyControl = null;
      this.xyLastPosition = null;
      this.xyMotion = 0;
      this.xyMotionTarget = 0;
      this.xyTravel = 0;
      if (tapped) {
        this.playXyChord(position.x, position.y, position.pointerX);
      }
    }
  }

  playTone({
    frequency,
    startRatio,
    attack,
    decay,
    release,
    level,
    ramp,
    pointerX,
    waveType,
  }) {
    this.createVoices();
    let voice = this.voices[this.nextVoice];
    this.nextVoice = (this.nextVoice + 1) % this.voices.length;

    voice.oscillator.setType(waveType);
    voice.envelope.setADSR(
      attack,
      decay,
      0,
      release,
    );
    voice.envelope.setRange(level, 0);
    voice.oscillator.pan(constrain(pointerX * 2 - 1, -0.7, 0.7));
    voice.oscillator.freq(frequency * startRatio);
    voice.oscillator.freq(frequency, ramp);
    voice.envelope.play();
  }
}
