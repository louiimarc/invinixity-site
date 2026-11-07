let audioContext;
let entered = false;
let localOrbit = false;
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
    bassSound = new SoundEngine(audioContext, audioContext.destination);
    for (let i = 0; i < numberOfEntity; i++) entity.push({sound:new SoundEngine(audioContext, audioContext.destination)});
    spectrumView = new SpectrumView(entity[0].sound.analyser);
    roomFX.setup();
    setupSoloInputs();
    setupPercussionInputs();
    stage.addEventListener('pointerdown', event => {
        if (entered && event.pointerType === 'touch') localOrbit = true;
    });
    new ResizeObserver(() => {
        if (width !== stage.clientWidth || height !== stage.clientHeight) resizeCanvas(stage.clientWidth, stage.clientHeight);
    }).observe(stage);

    document.getElementById('enter').onclick = async () => {
        const root = document.documentElement;
        const resume = audioContext.resume();
        if (!document.fullscreenElement && root.requestFullscreen) root.requestFullscreen().catch(() => {});
        try {
            await resume;
            entered = audioContext.state === 'running';
            join.hidden = entered && lastPacket > 0;
        } catch { statusLine.textContent = 'Tap again to enable audio.'; }
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
    playback.frames.length = 0;
    applySolo(-1);
    roomFX.syncPanel(-1, null);
    localOrbit = false;
    spectrumView.draw([], 0, []);
    bassChamber.clear();
    bassSound.silence();
    entity.forEach(box => box.sound.silence());
    lastPacket = 0;
    lastCount = 0;
    remoteSound = false;
    join.hidden = false;
    statusLine.textContent = message;
    document.getElementById('enter').disabled = true;
}

function receive(packet) {
    if (packet.type === 'waiting') { resetView('Waiting for the controller…'); return; }
    if (packet.type !== 'frame') return;
    const {frame, notes} = packet;
    if (!lastPacket) {
        document.getElementById('enter').disabled = false;
        statusLine.textContent = 'Controller connected';
        join.hidden = entered;
    }
    lastPacket = performance.now();
    if (remoteSound && !frame.sounding) {
        bassSound.silence();
        entity.forEach(box => box.sound.silence());
    }
    const activeCount = frame.activeCount ?? frame.boxes.length;
    for (let i = activeCount; i < lastCount; i++) entity[i].sound.silence();
    applySolo(frame.solo ?? -1);
    lastCount = activeCount;
    remoteSound = frame.sounding;
    playback.receive(frame);
    if (!entered || !remoteSound) return;
    if (frame.hat) scheduleNote(frame.hat, bassSound, audioContext);
    if (frame.kick) scheduleNote(frame.kick, bassSound, audioContext);
    for (const note of notes) {
        if (note.i >= activeCount || (soloIndex >= 0 && note.i !== soloIndex)) continue;
        if (note.voice.startsWith('file:') && !samples.has(note.voice)) continue;
        scheduleNote(note, entity[note.i].sound, audioContext);
    }
}

function draw() {
    background(9, 15, 30);
    const view = playback.frames[0]?.camera;
    if (localOrbit) orbitControl();
    else if (view) camera(...view.slice(0, 6).map(v => v * height), ...view.slice(6));
    playback.draw();
}
