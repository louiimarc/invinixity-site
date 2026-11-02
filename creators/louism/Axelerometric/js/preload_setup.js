function preload() {
    font = loadFont('assets/font/SyneMono-Regular.ttf');
}

function setup() {
    const stage = document.querySelector('#stage');
    createCanvas(stage.clientWidth, stage.clientHeight, WEBGL).parent(stage);
    pixelDensity(1);
    textFont(font);
    textAlign(CENTER, CENTER);

    spatialOutput = new SpatialOutput(getAudioContext());
    const defaultWaves = ['sine', 'sawtooth', 'square', 'triangle', 'sine', 'triangle'];
    for (let i = 0; i < numberOfEntity; i++) {
        entity.push({
            sound: new SoundEngine(getAudioContext()),
            sphere: new BouncingSphere(i),
            voice: defaultWaves[i],
            degree: i
        });
    }
    bassSound = new SoundEngine(getAudioContext());
    clock.origin = playback.now() / 1000;
    outputLevel = new p5.Amplitude(0.7);
    spectrumView = new SpectrumView(entity[0].sound.analyser);
    setupControls();
    setupSoloInputs();
    midi = new WebMIDIListener();
    setupPersistence();
    const tick = new Worker('js/tick-worker.js');
    tick.onmessage = pumpSimulation;
    control('show-qr').onclick = () => control('qr-dialog').showModal();
    lan.connect(data => {
        if (data.type === 'solo') toggleSolo(data.index);
        if (data.type === 'info') {
            const link = control('lan-link');
            link.href = data.url;
            link.textContent = data.url;
            control('present-link').hidden = control('show-qr').hidden = false;
            QRCode.toCanvas(control('qr-code'), data.url, {width:256, margin:4});

        }
    }, () => {
        control('present-link').hidden = control('show-qr').hidden = true;
        control('qr-dialog').close();
    });
    new ResizeObserver(() => {
        if (width !== stage.clientWidth || height !== stage.clientHeight) {
            resizeCanvas(stage.clientWidth, stage.clientHeight);
        }
    }).observe(stage);
}
