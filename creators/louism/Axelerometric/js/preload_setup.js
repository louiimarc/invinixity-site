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
            percussion: new SoundEngine(getAudioContext()),
            slice:randomPercussionSlice(), sliceHitAt:-1,
            sphere: new BouncingSphere(i),
            voice: defaultWaves[i],
            degree: i
        });
    }
    bassSound = new SoundEngine(getAudioContext());
    masterChamber.sphere=new BouncingSphere(0);
    masterChamber.sphere.speed=24;
    clock.origin = playback.now() / 1000;
    outputLevel = new p5.Amplitude(0.7);
    spectrumView = new SpectrumView(entity[0].sound.analyser);
    setupControls();
    motionControl.setup();
    roomFX.setup();
    setupSoloInputs();
    setupPercussionInputs();
    midi = new WebMIDIListener();
    setupPersistence();
    const tick = new Worker('js/tick-worker.js');
    tick.onmessage = pumpSimulation;
    setupPresentWindow();
    control('show-qr').onclick = () => control('qr-dialog').showModal();
    lan.connect(data => {
        if (data.type === 'hat-step') {
            setHatDivision(hatPlane.division + data.delta);
            queueSetupSave();
        }
        if(data.type==='motion')motionControl.receive(data.tilt);
        if(data.type==='shake')rerandomizeInstrument();
        handleChamberControl(data);
        if (data.type === 'unsolo') releaseSolo();
        if (data.type === 'solo') toggleSolo(data.index);
        if (data.type === 'info') {
            const link = control('lan-link');
            link.href = data.url;
            link.textContent = data.url;
            control('show-qr').hidden = false;
            QRCode.toCanvas(control('qr-code'), data.url, {width:256, margin:4});

        }
    }, () => {
        control('show-qr').hidden = true;
        control('qr-dialog').close();
    });
    new ResizeObserver(() => {
        if (width !== stage.clientWidth || height !== stage.clientHeight) {
            resizeCanvas(stage.clientWidth, stage.clientHeight);
        }
    }).observe(stage);
}

function setupPresentWindow() {
    const link=control('present-link');
    const url=new URL('present.html',location.href);
    if(typeof BroadcastChannel==='function')url.searchParams.set('local',lan.session);
    link.href=url.href;link.hidden=false;
    link.onclick=event=>{
        if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
        const popup=window.open(url.href,'axelerometric-present-'+lan.session,
            'popup=yes,width=1280,height=800,menubar=no,toolbar=no,location=no,status=no');
        if(popup){event.preventDefault();popup.focus();}
    };
}
