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
    tabletGestures.setup();
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
        if(data.type==='tempo-dial'&&tabletGestures.mirrorDial(data.dial))lan.send(data);
        if(data.type==='camera'&&lan.validCamera(data.view)){
            sceneCamera=data.view.slice();camera(...sceneCamera.slice(0,6).map(value=>value*height),...sceneCamera.slice(6));queueSetupSave();
        }
        if(data.type==='room-motion'&&['room','circle'].includes(data.mode)){setRoomMotion(data.mode);queueSetupSave();}
        if(data.type==='room-step'&&[1,-1].includes(data.delta)){setBoxCount(numberOfShownEntity+data.delta);queueSetupSave();}
        if(data.type==='tempo')setInstrumentTempo(data.bpm);
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
    inlinePresentation.setup();
    const link=control('present-link');
    const url=new URL('present.html',location.href);
    if(typeof BroadcastChannel==='function')url.searchParams.set('local',lan.session);
    link.href=url.href;link.hidden=false;
    link.onclick=event=>{
        if(navigator.standalone===true||matchMedia('(display-mode: standalone)').matches) {
            event.preventDefault();inlinePresentation.enter();return;
        }
        if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
        event.preventDefault();
        const popup=window.open(url.href,'axelerometric-present-'+lan.session,
            'popup=yes,width=1280,height=800,menubar=no,toolbar=no,location=no,status=no');
        if(popup)popup.focus();else inlinePresentation.enter();
    };
}

// Installed iOS web apps may reuse their only window for window.open. Keep the
// controller alive and change its layout instead of navigating to present.html.
const inlinePresentation={
    active:false,corner:null,lastTap:null,
    setup() {
        this.hint=document.createElement('p');this.hint.className='presentation-hint';this.hint.hidden=true;
        this.hint.setAttribute('role','status');
        this.hint.textContent='Presentation · Double-tap the top-left corner to return to controls';
        document.body.append(this.hint);
        window.addEventListener('popstate',()=>history.state?.axelerometricPresentation?this.show():this.restore());
        document.addEventListener('keydown',event=>{
            if(this.active&&event.key==='Escape') {
                event.preventDefault();event.stopImmediatePropagation();this.exit();
            }
        },true);
        document.addEventListener('pointerdown',event=>{
            if(!this.active||!event.isPrimary||event.button!==0||event.clientX>56||event.clientY>56)return;
            this.corner={id:event.pointerId,x:event.clientX,y:event.clientY,at:event.timeStamp};
            event.stopPropagation();
        },true);
        document.addEventListener('pointerup',event=>{
            const start=this.corner;if(!start||start.id!==event.pointerId)return;
            this.corner=null;event.stopPropagation();
            if(!this.active||event.timeStamp-start.at>400||Math.hypot(event.clientX-start.x,event.clientY-start.y)>10) {this.lastTap=null;return;}
            if(this.lastTap!==null&&event.timeStamp-this.lastTap<=450) {this.lastTap=null;this.exit();}
            else this.lastTap=event.timeStamp;
        },true);
        document.addEventListener('pointercancel',()=>{this.corner=null;this.lastTap=null;},true);
    },
    enter() {
        if(this.active)return;
        if(!history.state?.axelerometricPresentation)history.pushState({...history.state,axelerometricPresentation:true},'',location.href);
        this.show();
    },
    show() {
        if(this.active)return;
        this.active=true;tabletGestures.reset();document.body.classList.add('inline-present');
        this.hint.hidden=false;clearTimeout(this.hintTimer);
        this.hintTimer=setTimeout(()=>{this.hint.hidden=true;},3500);
    },
    restore() {
        this.active=false;this.corner=null;this.lastTap=null;
        document.body.classList.remove('inline-present');this.hint.hidden=true;clearTimeout(this.hintTimer);
    },
    exit() {
        this.restore();
        if(history.state?.axelerometricPresentation)history.back();
    }
};
