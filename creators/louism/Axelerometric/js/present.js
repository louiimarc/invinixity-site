const silentPresentation=new URLSearchParams(location.search).has('local');
document.body.classList.toggle('silent-presentation',silentPresentation);
let audioContext;
let entered = false;
let localOrbit = false;
let localOrbitUntil=0,followControllerAt=0,lastCameraSent=-Infinity;
const orbitPointers=new Set();
let lastPacket = 0;
let lastCount = 0;
let remoteSound = false;
const join = document.getElementById('join');
const statusLine = document.getElementById('join-status');

function preload() { font = loadFont('assets/font/SyneMono-Regular.ttf'); }

function setup() {
    const stage = document.getElementById('stage');
    createCanvas(stage.clientWidth, stage.clientHeight, WEBGL).parent(stage);
    pixelDensity(1);
    textFont(font);
    textAlign(CENTER, CENTER);
    audioContext = new AudioContext();
    spatialOutput = new SpatialOutput(audioContext);
    if(silentPresentation) {
        spatialOutput.master.output.gain.value=0;
        spatialOutput.stopTracking();
        document.getElementById('output-layout').disabled=true;
    }
    document.getElementById('enter').textContent=silentPresentation?'Enter fullscreen':'Enter fullscreen with sound';
    bassSound = new SoundEngine(audioContext, audioContext.destination);
    for (let i = 0; i < numberOfEntity; i++) entity.push({sound:new SoundEngine(audioContext, audioContext.destination),percussion:new SoundEngine(audioContext, audioContext.destination)});
    spectrumView = new SpectrumView(entity[0].sound.analyser);
    tabletGestures.setup();
    roomFX.setup();
    setupSoloInputs();
    setupPercussionInputs();
    stage.addEventListener('pointerdown',event=>{
        if(!entered||event.button!==0)return;
        orbitPointers.add(event.pointerId);localOrbit=true;
    });
    const release=event=>{
        if(!orbitPointers.has(event.pointerId))return;
        orbitPointers.delete(event.pointerId);
        if(orbitPointers.size)return;
        localOrbit=false;localOrbitUntil=performance.now()+250;followControllerAt=performance.now()+450;
    };
    document.addEventListener('pointerup',release);
    document.addEventListener('pointercancel',release);
    const stopOrbit=()=>{orbitPointers.clear();localOrbit=false;localOrbitUntil=0;followControllerAt=performance.now()+200;};
    window.addEventListener('blur',stopOrbit);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)stopOrbit();});
    stage.addEventListener('wheel',()=>{
        if(!entered)return;localOrbitUntil=performance.now()+300;followControllerAt=performance.now()+500;
    },{passive:true});
    new ResizeObserver(() => {
        if (width !== stage.clientWidth || height !== stage.clientHeight) resizeCanvas(stage.clientWidth, stage.clientHeight);
    }).observe(stage);

    document.getElementById('enter').onclick = async () => {
        if(matchMedia('(pointer: coarse)').matches)motionControl.enable();
        const root = document.documentElement;
        const resume = audioContext.resume();
        if (!document.fullscreenElement && root.requestFullscreen) root.requestFullscreen().catch(() => {});
        try {
            await resume;
            entered = audioContext.state === 'running';
            join.hidden = entered && lastPacket > 0;
        } catch { statusLine.textContent = silentPresentation?'Tap again to enter presentation.':'Tap again to enable audio.'; }
    };
    restoreSampleCache(audioContext).catch(() => { statusLine.textContent = 'Local sample cache unavailable.'; });
    const files = document.getElementById('local-files');
    files.onchange = () => loadLocalFiles(files.files);
    window.ondragover = e => e.preventDefault();
    window.ondrop = e => { e.preventDefault(); loadLocalFiles(e.dataTransfer.files); };
    lan.connect(receive, (message) => resetView(message || 'Reconnecting to the LAN server…'));
    // A suspended controller can leave the socket open but stop sending cues.
    setInterval(() => {
        if (lastPacket && performance.now() - lastPacket > 2000) resetView('Waiting for the controller…');
    }, 500);
}

async function loadLocalFiles(files) {
    for (const file of files) {
        try {
            samples.set(sampleKey(file), await audioContext.decodeAudioData(await file.arrayBuffer()));
            try { await cacheSample(file); } catch { statusLine.textContent = file.name + ' is available until refresh only.'; }
        }
        catch { statusLine.textContent = 'Could not decode ' + file.name; }
    }
}

function resetView(message) {
    playback.frames.length = 0;tabletGestures.reset();tabletGestures.mirrorDial(null);
    applySolo(-1);
    roomFX.viewMaster=null;
    roomFX.syncPanel();
    spatialOutput.master.flush();
    localOrbit = false;orbitPointers.clear();localOrbitUntil=followControllerAt=0;
    spectrumView.draw([], 0, []);
    bassChamber.clear();
    bassSound.silence();
    entity.forEach(box => {box.sound.silence();box.percussion.silence();});
    lastPacket = 0;
    lastCount = 0;
    remoteSound = false;
    join.hidden = false;
    statusLine.textContent = message;
    document.getElementById('enter').disabled = true;
}

function receive(packet) {
    if(packet.type==='tempo-dial'){tabletGestures.mirrorDial(packet.dial);return;}
    if (packet.type === 'waiting') { resetView('Waiting for the controller…'); return; }
    if (packet.type !== 'frame') return;
    const {frame, notes} = packet;
    if (!lastPacket) {
        document.getElementById('enter').disabled = false;
        statusLine.textContent = silentPresentation?'Controller connected · Sound stays in the controller':'Controller connected';
        join.hidden = entered;
    }
    lastPacket = performance.now();
    if (remoteSound && !frame.sounding) {
        spatialOutput.master.flush();
        bassSound.silence();
        entity.forEach(box => {box.sound.silence();box.percussion.silence();});
    }
    const activeCount = frame.activeCount ?? frame.boxes.length;
    for (let i = activeCount; i < lastCount; i++) {entity[i].sound.silence();entity[i].percussion.silence();}
    applySolo(frame.solo ?? -1);
    lastCount = activeCount;
    remoteSound = frame.sounding;
    roomFX.viewMaster=frame.master;
    spatialOutput.master.update(frame.master,frame.at);
    playback.receive(frame);
    if (!entered || !remoteSound) return;
    if (frame.hat) scheduleNote(frame.hat, bassSound, audioContext);
    if (frame.kick) scheduleNote(frame.kick, bassSound, audioContext);
    for (const note of notes) {
        if (note.i >= activeCount || (soloIndex >= 0 && note.i !== soloIndex)) continue;
        if (note.voice.startsWith('file:') && !samples.has(note.voice)) continue;
        scheduleNote(note, note.voice==='snare'?entity[note.i].percussion:entity[note.i].sound, audioContext);
    }
}

function draw() {
    background(9, 15, 30);
    const view = playback.frames[0]?.camera;
    const now=performance.now();
    if(localOrbit||now<localOrbitUntil) {
        orbitControl();
        if(now-lastCameraSent>=33) {
            lastCameraSent=now;
            const pose=this._renderer._curCamera;
            lan.send({type:'camera',view:[pose.eyeX,pose.eyeY,pose.eyeZ,pose.centerX,pose.centerY,pose.centerZ]
                .map(value=>value/height).concat(pose.upX,pose.upY,pose.upZ)});
        }
    } else if(view&&now>=followControllerAt)camera(...view.slice(0,6).map(value=>value*height),...view.slice(6));
    playback.draw();
}
