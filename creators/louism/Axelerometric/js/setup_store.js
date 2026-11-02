const setupKey = 'axelerometric.setup.v1';
const validVector = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
let lastStoredSetup;
let saveTimer;

function saveSetup() {
    clearTimeout(saveTimer);
    const state = {
        bpm: clock.bpm, grid: hitGrid, scale: control('scale').value,
        count: numberOfShownEntity, solo: soloIndex, selected: selectedChamber,
        room: control('room-motion').value, expanded: document.querySelector('.console').open,
        planeHeight: hatPlane.height, randomPlane: hatPlane.randomize,
        camera: sceneCamera, cc: midi.ccValues,
        chambers: entity.map(({voice, degree, sphere}) => ({
            voice, degree, hue: sphere.hue,
            position: sphere.position.array(), direction: sphere.direction.array()
        }))
    };
    try {
        const data = JSON.stringify(state);
        localStorage.setItem(setupKey, data);
        lastStoredSetup = data;
        return true;
    } catch {
        control('status').textContent = 'Browser storage unavailable. Setup could not be saved.';
        return false;
    }
}

function queueSetupSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveSetup, 150);
}

function sampleOption(key, label) {
    const voice = control('voice');
    if (![...voice.options].some(option => option.value === key)) voice.add(new Option(label, key));
}

function restoreSetup() {
    let state;
    try {
        lastStoredSetup = localStorage.getItem(setupKey);
        state = JSON.parse(lastStoredSetup);
    } catch { return; }
    if (!state || !Array.isArray(state.chambers)) return;
    if (Number.isFinite(state.bpm)) clock.bpm = Math.max(30, Math.min(300, state.bpm));
    control('tempo').value = clock.bpm;
    if ([...control('grid').options].some(o => Number(o.value) === state.grid)) {
        hitGrid = state.grid;
        control('grid').value = String(hitGrid);
    }
    if (Object.hasOwn(scales, state.scale)) {
        control('scale').value = state.scale;
        activeScale = scales[state.scale];
    }
    if (Number.isFinite(state.planeHeight)) hatPlane.height = Math.max(0.15, Math.min(0.85, state.planeHeight));
    hatPlane.randomize = state.randomPlane === true;
    control('plane-height').value = Math.round(hatPlane.height * 100);
    control('plane-height').disabled = hatPlane.randomize;
    control('plane-mode').value = hatPlane.randomize ? 'random' : 'fixed';
    for (const [i, box] of entity.entries()) {
        const saved = state.chambers[i];
        if (!saved) continue;
        if (typeof saved.voice === 'string' && /^file:\d+:/.test(saved.voice)) {
            sampleOption(saved.voice, saved.voice.replace(/^file:\d+:/, ''));
            box.voice = saved.voice;
        } else if (['sine','triangle','square','sawtooth'].includes(saved.voice)) box.voice = saved.voice;
        if (Number.isInteger(saved.degree) && saved.degree >= 0 && saved.degree < 16) box.degree = saved.degree;
        if (Number.isFinite(saved.hue)) box.sphere.hue = saved.hue;
        if (validVector(saved.position)) box.sphere.position.set(...saved.position);
        if (validVector(saved.direction) && Math.hypot(...saved.direction) > 0) box.sphere.direction.set(...saved.direction).normalize();
    }
    if (Number.isInteger(state.selected)) selectedChamber = Math.max(0, state.selected);
    setBoxCount(Number.isInteger(state.count) ? state.count : numberOfShownEntity);
    if (Number.isInteger(state.solo) && state.solo >= 0 && state.solo < numberOfShownEntity) applySolo(state.solo);
    slotProgress.forEach((_, i) => { slotProgress[i] = Number(i < numberOfShownEntity); });
    setRoomMotion(state.room === 'room' ? 'room' : 'circle');
    roomMotion.progress = roomMotion.target;
    document.querySelector('.console').open = state.expanded === true;
    if (Array.isArray(state.camera) && state.camera.length === 9 && state.camera.every(Number.isFinite)) {
        sceneCamera = state.camera;
        camera(...sceneCamera.slice(0,6).map(n => n * height), ...sceneCamera.slice(6));
    }
    for (const [cc, value] of Object.entries(state.cc || {})) {
        if (/^\d+$/.test(cc) && Number(cc) < 128 && Number.isInteger(value) && value >= 0 && value <= 127) midi.ccValues[cc] = value;
    }
}

function setupPersistence() {
    restoreSetup();
    const panel = document.querySelector('.console');
    panel.addEventListener('change', saveSetup);
    panel.addEventListener('toggle', saveSetup);
    control('save-setup').onclick = () => {
        if (saveSetup()) control('status').textContent = 'Setup saved in this browser.';
    };
    const stage = control('stage');
    stage.addEventListener('pointerup', queueSetupSave);
    stage.addEventListener('wheel', queueSetupSave, {passive:true});
    window.addEventListener('pagehide', () => {
        // An older tab closing should not replace a newer tab's setup.
        try { if (localStorage.getItem(setupKey) === lastStoredSetup) saveSetup(); } catch {}
    });
    if (!lastStoredSetup) saveSetup();
    restoreSampleCache(getAudioContext(), file => sampleOption(sampleKey(file), file.name))
        .then(() => {
            if (entity.some(box => box.voice.startsWith('file:') && !samples.has(box.voice)))
                control('status').textContent = 'Reimport the missing audio file to hear its assigned voice.';
        })
        .catch(() => { control('status').textContent = 'Local sample cache unavailable in this browser.'; });
}
