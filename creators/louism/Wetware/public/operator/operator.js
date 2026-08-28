import { cues, cueProgressRange } from "/show/cues.js";
import { connectShowClient } from "/common/client.js";
import { cueIndexFromCC, decodeControlChange } from "/common/midi.js";
import { cueSurface, SURFACE_LABELS, SURFACE_ORDER } from "/show/surfaces.js";
import { evaluateTechnicalCheck } from "/common/tech-check.js";
import { effectiveBlackout, emergencyBlackoutMessage, EMERGENCY_CHANNEL, reconcileEmergencyBlackout } from "/common/emergency.js";
import { appendRehearsalEntry, buildRehearsalReport, createRehearsalLog, normalizeRehearsalLog, rehearsalCueCsv } from "/common/rehearsal-log.js";
import { advanceFishWithLeftStick } from "/common/aquarium.js";
import { production, productionDateLabel } from "/show/production.js";
import { nuggetScriptQueue } from "/show/slideshow.js";
import { cueOutput, PROJECTOR_OUTPUT_LABELS } from "/show/outputs.js";
import { adjustLoadingProgress, bumperCueStep, gamepadButtonPressure, LEFT_BUMPER_BUTTON_INDEX, LEFT_TRIGGER_ACTIVATION_PRESSURE, LEFT_TRIGGER_BUTTON_INDEX, RIGHT_BUMPER_BUTTON_INDEX, RIGHT_TRIGGER_BUTTON_INDEX } from "/common/gamepad.js";

const $ = (id) => document.getElementById(id);
const REHEARSAL_STORAGE_KEY = "wetware-rehearsal-log-v1";
let currentState;
let wallProjectorWindow;
let floorProjectorWindow;
let heroFish = { x: 0.12, y: 0.5, z: 0.5 };
let lastGamepadBroadcast = 0;
let triggerProgress = 0;
let lastTriggerProgressSent = 0;
let triggerProgressActive = false;
let triggerProgressDirection = 0;
let lastMidiProgress = -1;
let lastMidiCue = -1;
let swarmTestActive = false;
let ipadOrderTestActive = false;
let ipadOrderStopTimer = null;
let latestDevices = [];
let latestAssetReport = null;
let operatorRtt = null;
let midiInputConnected = false;
let lastTechReport = null;
let lastCertificationFingerprint = null;
let emergencyBlackoutOverride = null;
let rehearsalLog = recoverRehearsalLog();
let pendingCueTrigger = "";
let deviceConnectionUrls = [];
let keystoneDrag = null;
let lastKeystoneDragSent = 0;
const pendingKeystonePoints = new Map();
let stoneMaskDraft = null;
let lastStoneMaskDraftSent = 0;
const STONE_MASK_CLOSE_RADIUS_PX = 28;
const STONE_MASK_MIN_PATH_PX = 84;
const emergencyChannel = new BroadcastChannel(EMERGENCY_CHANNEL);

$("eventMeta").textContent = productionDateLabel();

const client = connectShowClient({
  role: "operator",
  deviceId: "mac-operator",
  onState: renderState,
  onDevices: renderDevices,
  onTiming(timing) { operatorRtt = timing.rtt; },
  onConnection(status) {
    $("connectionDot").className = `status-dot ${status}`;
    $("connectionText").textContent = status.toUpperCase();
    if (status === "online" && emergencyBlackoutOverride !== null) client.sendAction({ type:"SET_BLACKOUT", value:emergencyBlackoutOverride });
    if (status === "online") refreshNetworkInfo();
    if (status === "online" || status === "offline") recordRehearsal("connection", { detail:status.toUpperCase() });
  }
});

$("go").onclick = () => act("GO");
$("back").onclick = () => act("BACK");
$("blackout").onclick = () => setEmergencyBlackout(!effectiveBlackout(currentState?.blackout, emergencyBlackoutOverride));
$("freeze").onclick = () => act("TOGGLE_FREEZE");
$("calibration").onclick = () => act("TOGGLE_CALIBRATION");
$("pulse").onclick = () => act("PULSE");
$("openWallProjector").onclick = () => {
  if (!wallProjectorWindow || wallProjectorWindow.closed) wallProjectorWindow = window.open("/projector/?output=wall", "wetware-projector-wall", "popup,width=1280,height=720");
  wallProjectorWindow?.focus();
};
$("openFloorProjector").onclick = () => {
  if (!floorProjectorWindow || floorProjectorWindow.closed) floorProjectorWindow = window.open("/projector/?output=floor", "wetware-projector-floor", "popup,width=1280,height=720");
  floorProjectorWindow?.focus();
};
$("enableMidi").onclick = enableMidi;
$("refreshCameraInputs").onclick = refreshCameraInputs;
$("cameraInputSelect").onchange = () => {
  const select = $("cameraInputSelect");
  const deviceId = select.value;
  const label = deviceId ? select.selectedOptions[0]?.textContent || "" : "";
  act("SET_CAMERA_DEVICE", { deviceId, label });
  $("cameraInputStatus").textContent = "CAMERA SELECTION SENT TO BACK WALL OUTPUT";
};
document.querySelectorAll("[data-setup-preview]").forEach((button) => {
  button.onclick = () => act("SET_SETUP_PREVIEW", { preview:button.dataset.setupPreview });
});
for (const [id,field] of [["kalaScale","scale"]]) {
  $(id).addEventListener("input", () => act("SET_KALA_FACE", { value:{ [field]:Number($(id).value) } }));
}
$("clearStoneMask").onclick = () => { stoneMaskDraft=null; act("CLEAR_STONE_MASK"); drawStoneMaskPad([]); };
$("stoneMaskPad").addEventListener("pointerdown", beginStoneMask);
$("stoneMaskPad").addEventListener("pointermove", moveStoneMask);
$("stoneMaskPad").addEventListener("pointerup", endStoneMask);
$("stoneMaskPad").addEventListener("pointercancel", endStoneMask);
$("surfaceSelect").add(new Option("BACK WALL · FULL-WINDOW QUAD", "screen"));
$("surfaceSelect").add(new Option("TOP-DOWN FLOOR · FULL-WINDOW QUAD", "floor"));
$("surfaceSelect").onchange = () => act("SET_CALIBRATION_SURFACE", { surface: $("surfaceSelect").value });
$("cornerSelect").onchange = () => renderMapping(currentState);
$("surfaceX").addEventListener("input", () => updateSurfaceCoordinate("x", Number($("surfaceX").value)));
$("surfaceY").addEventListener("input", () => updateSurfaceCoordinate("y", Number($("surfaceY").value)));
document.querySelectorAll(".nudge-pad button").forEach((button) => button.onclick = () => nudgeSurface(Number(button.dataset.dx), Number(button.dataset.dy)));
$("resetSurface").onclick = () => act("RESET_SURFACE", { surface: $("surfaceSelect").value });
$("openKeystoneDialog").onclick = () => openKeystoneDialog($("surfaceSelect").value);
document.querySelectorAll("[data-open-keystone]").forEach((button) => button.onclick = () => openKeystoneDialog(button.dataset.openKeystone));
$("keystoneClose").onclick = closeKeystoneDialog;
$("keystoneDialog").onclick = (event) => { if (event.target === $("keystoneDialog")) closeKeystoneDialog(); };
$("keystoneReset").onclick = () => act("RESET_SURFACE", { surface:$("surfaceSelect").value });
$("keystoneDone").onclick = () => { act("SET_CALIBRATION", { value:false }); closeKeystoneDialog(); };
document.querySelectorAll(".keystone-handle").forEach((handle) => {
  handle.addEventListener("pointerdown", beginKeystoneDrag);
  handle.addEventListener("mousedown", beginMouseKeystoneDrag);
});
document.addEventListener("pointermove", moveKeystoneDrag, true);
document.addEventListener("pointerup", endKeystoneDrag, true);
document.addEventListener("pointercancel", endKeystoneDrag, true);
window.addEventListener("mousemove", moveMouseKeystoneDrag);
window.addEventListener("mouseup", endMouseKeystoneDrag);
$("refreshAssets").onclick = refreshAssets;
$("copyDeviceLinks").onclick = copyDeviceLinks;
$("qrClose").onclick = closeQrDialog;
$("qrDialog").onclick = (event) => { if (event.target === $("qrDialog")) closeQrDialog(); };
$("runTechCheck").onclick = runTechCheck;
$("downloadTechReport").onclick = downloadTechReport;
$("startRehearsal").onclick = startRehearsalLog;
$("stopRehearsal").onclick = stopRehearsalLog;
$("addRehearsalNote").onclick = addRehearsalNote;
$("downloadRehearsalJson").onclick = downloadRehearsalJson;
$("downloadRehearsalCsv").onclick = downloadRehearsalCsv;
$("clearRehearsal").onclick = clearRehearsalLog;
$("rehearsalNote").addEventListener("input", renderRehearsalControls);
$("swarmTest").onclick = () => {
  swarmTestActive = !swarmTestActive;
  $("swarmTest").classList.toggle("active", swarmTestActive);
  $("swarmTest").textContent = swarmTestActive ? "STOP SWARM TEST" : "SWARM LINE TEST";
  if (!swarmTestActive) {
    client.sendInput({ source:"gamepad", active:false, ...heroFish, axisX:0, axisY:0, axisZ:0, axisRX:0, leftTrigger:0, rightTrigger:0, leftBumper:false, rightBumper:false, start:false });
    $("gamepadStatus").textContent = "Move a stick or press a button";
  }
};
$("ipadOrderTest").onclick = () => setIpadOrderTest(!ipadOrderTestActive);
$("confirmIpadOrder").addEventListener("change", () => markTechReportStale("IPAD PHYSICAL ORDER CONFIRMATION CHANGED"));
bindVirtualCC("virtualIntensity", "intensity", 2);
bindVirtualCC("virtualFishSpeed", "fish-speed", 3);
bindVirtualCC("virtualFishDepth", "fish-depth", 4);
$("progress").addEventListener("input", (event) => {
  $("progressValue").textContent = `${event.target.value}%`;
});
$("progress").addEventListener("change", (event) => act("SET_PROGRESS", { value: Number(event.target.value) }));

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !$("keystoneDialog").hidden) { closeKeystoneDialog(); return; }
  if (event.key === "Escape" && !$("qrDialog").hidden) { closeQrDialog(); return; }
  if (event.target.matches("input,select")) return;
  if (event.altKey && ["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(event.key)) {
    event.preventDefault();
    const delta = event.shiftKey ? .02 : .005;
    if (event.key === "ArrowLeft") nudgeSurface(-delta, 0);
    if (event.key === "ArrowRight") nudgeSurface(delta, 0);
    if (event.key === "ArrowUp") nudgeSurface(0, -delta);
    if (event.key === "ArrowDown") nudgeSurface(0, delta);
    return;
  }
  if (event.code === "Space") { event.preventDefault(); act("GO"); }
  if (event.key === "ArrowLeft") act("BACK");
  if (event.key === "ArrowRight") act("GO");
  if (event.key.toLowerCase() === "b") setEmergencyBlackout(!effectiveBlackout(currentState?.blackout, emergencyBlackoutOverride));
  if (event.key.toLowerCase() === "f") act("TOGGLE_FREEZE");
  if (event.key.toLowerCase() === "c") act("TOGGLE_CALIBRATION");
});

function act(type, data = {}) {
  const detail = actionDetail(type, data);
  if (["GO", "BACK", "SELECT_CUE"].includes(type)) pendingCueTrigger = detail;
  if (["GO", "BACK", "SELECT_CUE", "SET_PROGRESS", "TOGGLE_FREEZE", "TOGGLE_CALIBRATION", "SET_CAMERA_DEVICE", "PULSE"].includes(type)) {
    recordRehearsal("action", { detail });
  }
  client.sendAction({ type, ...data });
}

function setEmergencyBlackout(value) {
  emergencyBlackoutOverride = Boolean(value);
  emergencyChannel.postMessage(emergencyBlackoutMessage(emergencyBlackoutOverride));
  client.sendAction({ type:"SET_BLACKOUT", value:emergencyBlackoutOverride });
  recordRehearsal("action", { detail:`BLACKOUT ${emergencyBlackoutOverride ? "ON" : "OFF"}${emergencyBlackoutOverride !== null ? " · LOCAL MIRROR" : ""}` });
  renderBlackoutButton();
}

function renderBlackoutButton() {
  const local = emergencyBlackoutOverride !== null;
  $("blackout").classList.toggle("active", effectiveBlackout(currentState?.blackout, emergencyBlackoutOverride));
  $("blackout").replaceChildren(document.createTextNode("BLACKOUT "));
  const status = document.createElement("span");
  status.textContent = local ? "LOCAL" : "B";
  $("blackout").append(status);
}

function startRehearsalLog() {
  const startedAt = client.serverNow();
  rehearsalLog = createRehearsalLog({ title:$("rehearsalTitle").value, startedAt });
  recordRehearsal("session-start", { at:startedAt, detail:"OPERATOR START" });
  const cue = cues[currentState?.cueIndex] || cues[0];
  recordRehearsal("cue-enter", {
    at:startedAt,
    cueId:cue.id,
    cueNumber:cue.number,
    label:cue.label,
    revision:currentState?.revision,
    detail:"SESSION START"
  });
}

function stopRehearsalLog() {
  if (!rehearsalLog?.active) return;
  recordRehearsal("session-stop", { detail:"OPERATOR STOP" });
}

function addRehearsalNote() {
  const note = $("rehearsalNote").value.trim();
  if (!note || !rehearsalLog?.active) return;
  recordRehearsal("note", { note });
  $("rehearsalNote").value = "";
  renderRehearsalControls();
}

function recordRehearsalState(previous, next) {
  if (!rehearsalLog?.active || !previous) return;
  const at = Number(next.updatedAt) || client.serverNow();
  const cue = cues[next.cueIndex] || cues[0];
  if (previous.cueId !== next.cueId) {
    recordRehearsal("cue-enter", {
      at,
      cueId:cue.id,
      cueNumber:cue.number,
      label:cue.label,
      revision:next.revision,
      detail:pendingCueTrigger || "STATE SYNC"
    });
    pendingCueTrigger = "";
  } else if (previous.revision !== next.revision) {
    pendingCueTrigger = "";
  }
  const changes = [
    ["progress", `PROGRESS ${Math.round(next.progress)}%`],
    ["blackout", `BLACKOUT ${next.blackout ? "ON" : "OFF"}`],
    ["frozen", `FREEZE ${next.frozen ? "ON" : "OFF"}`],
    ["calibration", `CALIBRATION ${next.calibration ? "ON" : "OFF"}`],
    ["cameraDeviceId", "CAMERA INPUT UPDATED"],
    ["pulse", `PULSE ${next.pulse}`],
    ["nuggetIndex", `NUGGET ${next.nuggetIndex + 1}/${nuggetScriptQueue.length} · ${nuggetScriptQueue[next.nuggetIndex]}`]
  ];
  for (const [field, detail] of changes) {
    if (previous[field] !== next[field]) recordRehearsal("state", {
      at,
      cueId:cue.id,
      cueNumber:cue.number,
      label:cue.label,
      revision:next.revision,
      detail
    });
  }
}

function recordRehearsal(type, fields = {}) {
  if (!rehearsalLog?.active) return;
  const cue = cues[currentState?.cueIndex] || cues[0];
  rehearsalLog = appendRehearsalEntry(rehearsalLog, {
    type,
    at:fields.at ?? client.serverNow(),
    cueId:fields.cueId ?? cue.id,
    cueNumber:fields.cueNumber ?? cue.number,
    label:fields.label ?? cue.label,
    revision:fields.revision ?? currentState?.revision,
    detail:fields.detail,
    note:fields.note
  });
  persistRehearsalLog();
  renderRehearsalControls();
}

function actionDetail(type, data) {
  if (type === "SELECT_CUE") {
    const cue = cues.find((item) => item.id === data.cueId);
    return `DIRECT SELECT ${cue?.number || data.cueId || "UNKNOWN"}`;
  }
  if (type === "SET_PROGRESS") return `SET PROGRESS ${formatProgress(data.value)}`;
  if (type === "SET_CAMERA_DEVICE") return "CAMERA INPUT CHANGED";
  return type.replaceAll("_", " ");
}

function recoverRehearsalLog() {
  try { return normalizeRehearsalLog(JSON.parse(localStorage.getItem(REHEARSAL_STORAGE_KEY) || "null")); }
  catch { return null; }
}

function persistRehearsalLog() {
  try {
    if (rehearsalLog) localStorage.setItem(REHEARSAL_STORAGE_KEY, JSON.stringify(rehearsalLog));
  } catch {}
}

function renderRehearsalControls() {
  const active = Boolean(rehearsalLog?.active);
  const report = rehearsalLog ? buildRehearsalReport(rehearsalLog, client.serverNow()) : null;
  $("rehearsalTitle").disabled = active;
  $("startRehearsal").disabled = active;
  $("stopRehearsal").disabled = !active;
  $("addRehearsalNote").disabled = !active || !$("rehearsalNote").value.trim();
  $("downloadRehearsalJson").disabled = !report;
  $("downloadRehearsalCsv").disabled = !report;
  $("clearRehearsal").disabled = !report || active;
  $("rehearsalStatus").classList.toggle("active", active);
  $("rehearsalStatus").textContent = !report
    ? "NO ACTIVE LOG"
    : `${active ? "RECORDING" : "STOPPED"} · ${formatDuration(report.summary.durationMs)} · ${report.summary.cueVisitCount} CUE VISITS · ${report.summary.entryCount} EVENTS`;
  if (report && !active) $("rehearsalTitle").value = report.title;
  const recent = report?.entries.slice(-10).reverse() || [];
  $("rehearsalEntries").replaceChildren(...recent.map((entry) => {
    const row = document.createElement("div");
    row.className = "rehearsal-entry";
    const time = document.createElement("time");
    time.textContent = `+${formatDuration(Math.max(0, entry.at - report.startedAt))}`;
    const cue = document.createElement("strong");
    cue.textContent = entry.cueNumber || "—";
    const detail = document.createElement("span");
    detail.textContent = entry.note || entry.detail || entry.type.toUpperCase();
    row.append(time, cue, detail);
    return row;
  }));
}

function downloadRehearsalJson() {
  const report = buildRehearsalReport(rehearsalLog, client.serverNow());
  if (report) downloadText(`${JSON.stringify(report, null, 2)}\n`, "json", "application/json");
}

function downloadRehearsalCsv() {
  const csv = rehearsalCueCsv(rehearsalLog, client.serverNow());
  if (csv) downloadText(csv, "csv", "text/csv");
}

function clearRehearsalLog() {
  if (!rehearsalLog || rehearsalLog.active) return;
  rehearsalLog = null;
  try { localStorage.removeItem(REHEARSAL_STORAGE_KEY); } catch {}
  $("rehearsalTitle").value = "Wetware rehearsal";
  renderRehearsalControls();
}

function downloadText(text, extension, type) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type }));
  link.download = `${(rehearsalLog?.title || "wetware-rehearsal").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "wetware-rehearsal"}-${rehearsalLog?.startedAt || Date.now()}.${extension}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds % 3600 / 60);
  const seconds = totalSeconds % 60;
  return hours ? `${hours}:${String(minutes).padStart(2,"0")}:${String(seconds).padStart(2,"0")}` : `${minutes}:${String(seconds).padStart(2,"0")}`;
}

function setIpadOrderTest(active) {
  ipadOrderTestActive = Boolean(active);
  clearTimeout(ipadOrderStopTimer);
  $("ipadOrderTest").classList.toggle("active", ipadOrderTestActive);
  $("ipadOrderTest").textContent = ipadOrderTestActive ? "STOP ORDER TEST" : "IPAD ORDER TEST";
  client.sendInput({ source:"identify", active:ipadOrderTestActive, startedAt:ipadOrderTestActive ? client.serverNow() : 0 });
  if (ipadOrderTestActive) ipadOrderStopTimer = setTimeout(() => setIpadOrderTest(false), 20000);
}

function renderState(state) {
  recordRehearsalState(currentState, state);
  currentState = state;
  emergencyBlackoutOverride = reconcileEmergencyBlackout(emergencyBlackoutOverride, state.blackout);
  const cue = cues[state.cueIndex];
  $("cueNumber").textContent = cue.number;
  $("section").textContent = cue.section.toUpperCase();
  $("cueLabel").textContent = cue.label;
  $("cueNote").textContent = cue.note;
  reconcileCueList();
  const [progressMinimum,progressMaximum] = cueProgressRange(cue);
  $("progress").min = progressMinimum;
  $("progress").max = progressMaximum;
  $("progress").value = state.progress;
  $("progressValue").textContent = formatProgress(state.progress);
  renderBlackoutButton();
  $("freeze").classList.toggle("active", state.frozen);
  $("calibration").classList.toggle("active", state.calibration);
  $("revision").textContent = `REV ${state.revision}`;
  $("cueSurface").textContent = `${PROJECTOR_OUTPUT_LABELS[cueOutput(cue)]} · ${SURFACE_LABELS[cueSurface(cue)]}`;
  renderSceneSetup(state);
  renderMapping(state);
  syncCameraInputSelection(state.cameraDeviceId);
  renderKeystonePreviews(state);
  document.querySelectorAll(".cue-row").forEach((row) => row.classList.toggle("active", row.dataset.cueId === state.cueId));
}

function renderSceneSetup(state) {
  const settings=state.kalaFace || { x:.5,y:.5,scale:.42 };
  for(const [id,field] of [["kalaScale","scale"]]) {
    $(id).value=settings[field];
    $(`${id}Value`).value=Number(settings[field]).toFixed(3);
  }
  document.querySelectorAll("[data-setup-preview]").forEach((button)=>button.classList.toggle("active",button.dataset.setupPreview===state.setupPreview));
  if(!stoneMaskDraft && state.stoneMaskDraft?.length) stoneMaskDraft=state.stoneMaskDraft.map((point)=>[...point]);
  if(stoneMaskDraft) drawStoneMaskPad(stoneMaskDraft);
  else drawStoneMaskPad(state.stoneMask || []);
}

function beginStoneMask(event) {
  if(!stoneMaskDraft) stoneMaskDraft=[];
  event.currentTarget.setPointerCapture?.(event.pointerId);
  appendStoneMaskPoint(event,true);
  event.preventDefault();
}

function moveStoneMask(event) {
  if(!stoneMaskDraft || !(event.buttons&1)) return;
  appendStoneMaskPoint(event,false);
  event.preventDefault();
}

function endStoneMask(event) {
  if(!stoneMaskDraft) return;
  appendStoneMaskPoint(event,true);
  event.preventDefault();
}

function appendStoneMaskPoint(event,force) {
  const canvas=$("stoneMaskPad");
  const rect=canvas.getBoundingClientRect();
  const point=[clamp01((event.clientX-rect.left)/rect.width),clamp01((event.clientY-rect.top)/rect.height)];
  const previous=stoneMaskDraft.at(-1);
  if(!force && previous && Math.hypot(point[0]-previous[0],point[1]-previous[1])<.004) return;
  if(stoneMaskDraft.length<512) stoneMaskDraft.push(point);
  drawStoneMaskPad(stoneMaskDraft);
  if(stoneMaskCanClose(stoneMaskDraft,rect)) completeStoneMask();
  else sendStoneMaskDraft(force);
}

function sendStoneMaskDraft(force=false) {
  const now=performance.now();
  if(!force && now-lastStoneMaskDraftSent<33) return;
  client.sendAction({ type:"SET_STONE_MASK_DRAFT",points:stoneMaskDraft || [] });
  lastStoneMaskDraftSent=now;
}

function stoneMaskCanClose(points,rect) {
  if(points.length<4) return false;
  const [startX,startY]=points[0], [endX,endY]=points.at(-1);
  const closingDistance=Math.hypot((endX-startX)*rect.width,(endY-startY)*rect.height);
  let pathLength=0;
  for(let index=1;index<points.length;index++) {
    pathLength+=Math.hypot((points[index][0]-points[index-1][0])*rect.width,(points[index][1]-points[index-1][1])*rect.height);
  }
  return closingDistance<=STONE_MASK_CLOSE_RADIUS_PX && pathLength>=STONE_MASK_MIN_PATH_PX;
}

function completeStoneMask() {
  const completed=[...stoneMaskDraft.slice(0,-1),[...stoneMaskDraft[0]]];
  stoneMaskDraft=null;
  act("SET_STONE_MASK",{ points:completed });
  drawStoneMaskPad(completed);
}

function drawStoneMaskPad(points) {
  const canvas=$("stoneMaskPad");
  const context=canvas.getContext("2d");
  context.fillStyle="#000"; context.fillRect(0,0,canvas.width,canvas.height);
  context.strokeStyle="#ff3f78"; context.lineWidth=5; context.lineJoin="round"; context.lineCap="round";
  if(!points?.length) return;
  context.beginPath(); context.moveTo(points[0][0]*canvas.width,points[0][1]*canvas.height);
  for(let index=1;index<points.length;index++) context.lineTo(points[index][0]*canvas.width,points[index][1]*canvas.height);
  if(!stoneMaskDraft && points.length>=3) context.closePath();
  context.stroke();
  context.fillStyle="#ff3f7838"; if(!stoneMaskDraft && points.length>=3) context.fill();
  if(stoneMaskDraft) {
    const rect=canvas.getBoundingClientRect();
    const radius=STONE_MASK_CLOSE_RADIUS_PX*canvas.width/Math.max(1,rect.width);
    context.beginPath(); context.arc(points[0][0]*canvas.width,points[0][1]*canvas.height,radius,0,Math.PI*2);
    context.strokeStyle="#71ff4b"; context.lineWidth=3; context.stroke();
  }
}

function clamp01(value) { return Math.max(0,Math.min(1,Number(value)||0)); }

function renderDevices(devices) {
  latestDevices = devices;
  renderCameraInputStatus(devices);
  renderKeystonePreviews(currentState);
  if (lastCertificationFingerprint && certificationFingerprint(devices) !== lastCertificationFingerprint) markTechReportStale("DEVICE OR DISPLAY STATE CHANGED");
  const expected = [
    ["mac-projector-wall", "BACK WALL"], ["mac-projector-floor", "TOP-DOWN FLOOR"],
    ["ipad-1", "AQUARIUM 1"], ["ipad-2", "AQUARIUM 2"], ["ipad-3", "AQUARIUM 3"],
    ["nugget-launchpad", "NUGGET PAD"], ["kala-controller", "KALA FACE"]
  ];
  $("deviceGrid").replaceChildren(...expected.map(([id, label]) => {
    const matches = devices.filter((device) => device.deviceId === id);
    const found = matches[0];
    const element = document.createElement("div");
    element.className = `device ${found ? "" : "missing"} ${matches.length > 1 ? "duplicate" : ""}`;
    const dot = document.createElement("span");
    dot.className = `status-dot ${found && matches.length === 1 ? "online" : ""}`;
    const copy = document.createElement("div");
    copy.append(document.createTextNode(label));
    const detail = document.createElement("small");
    if (!found) detail.textContent = "MISSING";
    else if (matches.length > 1) detail.textContent = `${matches.length} DUPLICATE CLIENTS`;
    else detail.textContent = deviceDetail(found);
    copy.append(detail);
    element.append(dot, copy);
    return element;
  }));
}

function syncCameraInputSelection(deviceId = "") {
  const select = $("cameraInputSelect");
  const selected = String(deviceId || "");
  if (selected && ![...select.options].some((option) => option.value === selected)) {
    select.add(new Option("SAVED CAMERA · REFRESH TO IDENTIFY", selected));
  }
  select.value = selected;
}

async function refreshCameraInputs() {
  const button = $("refreshCameraInputs");
  const status = $("cameraInputStatus");
  button.disabled = true;
  status.textContent = "CHECKING CAMERA INPUTS…";
  let permissionStream;
  try {
    if (!navigator.mediaDevices?.getUserMedia || !navigator.mediaDevices?.enumerateDevices) throw new Error("CAMERA INPUT IS NOT AVAILABLE IN THIS BROWSER");
    permissionStream = await navigator.mediaDevices.getUserMedia({ video:true, audio:false });
    permissionStream.getTracks().forEach((track) => track.stop());
    permissionStream = null;
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "videoinput");
    $("cameraInputSelect").replaceChildren(
      new Option("DEFAULT CAMERA", ""),
      ...devices.map((device, index) => new Option(device.label || `CAMERA ${index + 1}`, device.deviceId))
    );
    syncCameraInputSelection(currentState?.cameraDeviceId);
    const selectedOption = $("cameraInputSelect").selectedOptions[0];
    if (currentState?.cameraDeviceId && selectedOption && !selectedOption.textContent.startsWith("SAVED CAMERA")) {
      const label = selectedOption.textContent || "";
      if (label !== currentState.cameraDeviceLabel) client.sendAction({ type:"SET_CAMERA_DEVICE", deviceId:currentState.cameraDeviceId, label });
    }
    const continuity = devices.some((device) => /iphone|continuity/i.test(device.label));
    status.textContent = devices.length
      ? `${devices.length} CAMERA${devices.length === 1 ? "" : "S"} FOUND${continuity ? " · IPHONE CONTINUITY AVAILABLE" : ""}`
      : "NO CAMERA INPUTS FOUND";
  } catch (error) {
    status.textContent = `CAMERA ACCESS FAILED · ${error?.message || "UNKNOWN ERROR"}`;
  } finally {
    permissionStream?.getTracks?.().forEach((track) => track.stop());
    button.disabled = false;
  }
}

function renderCameraInputStatus(devices) {
  const wall = devices.find((device) => device.deviceId === "mac-projector-wall");
  const cameraInput = wall?.telemetry?.cameraInput;
  if (!wall) $("cameraInputStatus").textContent = "BACK WALL OUTPUT OFFLINE";
  else if (cameraInput?.ready) $("cameraInputStatus").textContent = `ACTIVE · ${cameraInput.label || "CAMERA"}`;
  else if (cameraInput?.error) $("cameraInputStatus").textContent = `CAMERA FAILED · ${cameraInput.error}`;
  else $("cameraInputStatus").textContent = "SELECT A CAMERA HERE · ARM BACK WALL OUTPUT TO START IT";
}

function deviceDetail(device) {
  const telemetry = device.telemetry;
  if (!telemetry) return "CONNECTED · WAITING FOR TELEMETRY";
  const media = device.deviceId.startsWith("mac-projector-") && telemetry.mediaProbe
    ? telemetry.mediaProbe.status === "failed"
      ? ` · MEDIA FAILED · ${telemetry.mediaProbe.failed} ASSETS`
      : ` · MEDIA ${telemetry.mediaProbe.status.toUpperCase()} ${telemetry.mediaProbe.checked}/${telemetry.mediaProbe.total}`
    : "";
  const cameraInput = device.deviceId === "mac-projector-wall" && telemetry.cameraInput
    ? telemetry.cameraInput.ready
      ? ` · CAMERA ${telemetry.cameraInput.label || "READY"}`
      : telemetry.cameraInput.error ? " · CAMERA FAILED" : " · CAMERA NOT ARMED"
    : "";
  return `${telemetry.width}×${telemetry.height} · ${telemetry.rtt == null ? "PING…" : `${telemetry.rtt}ms`} · ${telemetry.displayMode.toUpperCase()}${media}${cameraInput}`;
}

async function refreshNetworkInfo() {
  try {
    const response = await fetch("/api/status", { cache:"no-store" });
    if (!response.ok) throw new Error("status unavailable");
    const status = await response.json();
    const address = status.network?.hostname || status.network?.addresses?.[0];
    const port = Number(status.network?.port) || location.port || 4173;
    if (!address) throw new Error("no local address");
    $("ipadServerAddress").textContent = `${address}:${port}`;
    const ipadUrls = [1, 2, 3].map((index) => `http://${address}:${port}/ipad/${index}/`);
    const nuggetUrl = `http://${address}:${port}/nugget/`;
    const lightingUrl = `http://${address}:${port}/lighting/`;
    const kalaUrl = `http://${address}:${port}/kala/`;
    deviceConnectionUrls = [...ipadUrls, nuggetUrl, kalaUrl, lightingUrl];
    const links = [
      ...ipadUrls.map((url, index) => ({ label:`IPAD ${index + 1}`, url })),
      { label:"NUGGET PAD", url:nuggetUrl },
      { label:"KALA FACE", url:kalaUrl },
      { label:"LIGHTING", url:lightingUrl }
    ];
    $("ipadLinks").replaceChildren(...links.map(({ label, url }) => deviceQrLink(label, url)));
    $("copyDeviceLinks").disabled = false;
  } catch {
    deviceConnectionUrls = [];
    $("ipadServerAddress").textContent = "NETWORK ADDRESS UNAVAILABLE";
    $("ipadLinks").replaceChildren();
    $("copyDeviceLinks").disabled = true;
  }
}

function deviceQrLink(labelText, url) {
  const row = document.createElement("div");
  row.className = "ipad-link";
  const label = document.createElement("strong");
  label.textContent = labelText;
  const link = document.createElement("a");
  link.href = url;
  link.textContent = url;
  link.title = `Show QR code for ${labelText}`;
  link.onclick = (event) => {
    event.preventDefault();
    showQrDialog(labelText, url);
  };
  row.append(label, link);
  return row;
}

function showQrDialog(label, url) {
  $("qrTitle").textContent = label;
  $("qrUrl").textContent = url;
  $("qrImage").src = `/api/qr?text=${encodeURIComponent(url)}`;
  $("qrImage").alt = `QR code for ${label}`;
  $("qrDialog").hidden = false;
  document.body.classList.add("qr-open");
  $("qrClose").focus();
}

function closeQrDialog() {
  $("qrDialog").hidden = true;
  $("qrImage").removeAttribute("src");
  document.body.classList.remove("qr-open");
}

async function copyDeviceLinks() {
  if (!deviceConnectionUrls.length) return;
  const button = $("copyDeviceLinks");
  try {
    await navigator.clipboard.writeText(deviceConnectionUrls.join("\n"));
    button.textContent = "COPIED";
  } catch {
    button.textContent = "COPY FAILED · SELECT URLS ABOVE";
  }
  setTimeout(() => { button.textContent = "COPY ALL 6 URLS"; }, 1800);
}

function buildCueList() {
  $("cues").replaceChildren(...cues.map((cue, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cue-row";
    button.dataset.cueId = cue.id;
    button.innerHTML = `<span class="num">${cue.number}</span><span>${cue.label}<small>${cue.section}</small></span><span class="mode">${cue.projector}</span>`;
    button.onclick = () => act("SELECT_CUE", { cueId: cue.id });
    button.classList.toggle("active", currentState?.cueId === cue.id || currentState?.cueIndex === index);
    return button;
  }));
}

function reconcileCueList() {
  const rows=[...document.querySelectorAll(".cue-row")];
  if(rows.length!==cues.length || rows.some((row,index)=>row.dataset.cueId!==cues[index].id)) buildCueList();
}

buildCueList();
refreshAssets();
renderRehearsalControls();
setInterval(renderRehearsalControls, 1000);

window.addEventListener("gamepadconnected", (event) => {
  markTechReportStale("GAMEPAD STATE CHANGED");
  $("gamepadDot").classList.add("online");
  $("gamepadStatus").textContent = event.gamepad.id;
});
window.addEventListener("gamepaddisconnected", () => {
  markTechReportStale("GAMEPAD STATE CHANGED");
  $("gamepadDot").classList.remove("online");
  $("gamepadStatus").textContent = "Disconnected";
  finishTriggerProgress();
  client.sendInput({ source:"gamepad", active:false, ...heroFish, axisX:0, axisY:0, axisZ:0, axisRX:0, leftTrigger:0, rightTrigger:0, leftBumper:false, rightBumper:false, start:false });
});

let previousFrame = performance.now();
let previousGamepadBumpers = { left:false,right:false };
function pollGamepad(now) {
  const gamepad = [...navigator.getGamepads?.() || []].find(Boolean);
  if(!gamepad) previousGamepadBumpers={ left:false,right:false };
  const delta = Math.min(50, now - previousFrame) / 1000;
  previousFrame = now;
  if (gamepad) {
    $("gamepadDot").classList.add("online");
    const leftTrigger = gamepadButtonPressure(gamepad.buttons[LEFT_TRIGGER_BUTTON_INDEX]);
    const rightTrigger = gamepadButtonPressure(gamepad.buttons[RIGHT_TRIGGER_BUTTON_INDEX]);
    const progressPressure = rightTrigger - leftTrigger;
    $("gamepadStatus").textContent = `${gamepad.id.slice(0, 28)} · LT ↶ ${Math.round(leftTrigger * 100)}% · RT ↷ ${Math.round(rightTrigger * 100)}%`;
    const axisX = deadzone(gamepad.axes[0] || 0);
    const axisZ = deadzone(gamepad.axes[1] || 0);
    const axisRX = deadzone(gamepad.axes[2] || 0);
    const axisY = deadzone(gamepad.axes[3] || 0);
    const leftBumper = Boolean(gamepad.buttons[LEFT_BUMPER_BUTTON_INDEX]?.pressed);
    const rightBumper = Boolean(gamepad.buttons[RIGHT_BUMPER_BUTTON_INDEX]?.pressed);
    const start = Boolean(gamepad.buttons[9]?.pressed);
    const cueStep=bumperCueStep(previousGamepadBumpers,{ left:leftBumper,right:rightBumper });
    previousGamepadBumpers={ left:leftBumper,right:rightBumper };
    if(cueStep<0) act("BACK");
    else if(cueStep>0) act("GO");
    if (!currentState?.frozen) heroFish = advanceFishWithLeftStick(heroFish,axisX,axisZ,delta);
    updateTriggerProgress(progressPressure, delta, now);
    $("fishMarker").style.left = `${heroFish.x * 100}%`;
    if (now - lastGamepadBroadcast > 16) {
      client.sendInput({ source:"gamepad", active:true, ...heroFish, axisX, axisY, axisZ, axisRX, leftTrigger, rightTrigger, leftBumper, rightBumper, start });
      lastGamepadBroadcast = now;
    }
  } else if (swarmTestActive) {
    finishTriggerProgress();
    if (!currentState?.frozen) {
      heroFish.x = (now / 8000) % 1;
      heroFish.y = .5;
      heroFish.z = .5 + Math.sin(now / 1300) * .18;
    }
    $("gamepadDot").classList.add("connecting");
    $("gamepadStatus").textContent = "AUTOPILOT LINE TEST · GAMEPAD OVERRIDES";
    $("fishMarker").style.left = `${heroFish.x * 100}%`;
    if (now - lastGamepadBroadcast > 45) {
      client.sendInput({ source:"gamepad", active:true, ...heroFish, axisX:.5, axisY:0, axisZ:0, axisRX:0, leftTrigger:0, rightTrigger:0, leftBumper:false, rightBumper:false, start:false });
      lastGamepadBroadcast = now;
    }
  } else {
    finishTriggerProgress();
    $("gamepadDot").classList.remove("connecting");
  }
  requestAnimationFrame(pollGamepad);
}
requestAnimationFrame(pollGamepad);

function updateTriggerProgress(signedPressure, delta, now) {
  const cue = cues[currentState?.cueIndex] || cues[0];
  const [progressMinimum,progressMaximum] = cueProgressRange(cue);
  const direction = Math.sign(signedPressure);
  const progress = Number(currentState?.progress) || 0;
  const canAdjust = Math.abs(signedPressure) > LEFT_TRIGGER_ACTIVATION_PRESSURE
    && cue.projector !== "black"
    && !currentState?.frozen
    && ((direction > 0 && progress < progressMaximum) || (direction < 0 && progress > progressMinimum));
  if (!canAdjust) {
    finishTriggerProgress();
    triggerProgress = progress;
    return;
  }
  if (!triggerProgressActive || triggerProgressDirection !== direction) {
    if (triggerProgressActive) finishTriggerProgress();
    triggerProgress = progress;
    triggerProgressActive = true;
    triggerProgressDirection = direction;
    recordRehearsal("action", { detail:`${direction > 0 ? "RT FORWARD" : "LT REVERSE"} PROGRESS START · ${Math.round(Math.abs(signedPressure) * 100)}% PRESSURE` });
  }
  triggerProgress = direction > 0 ? Math.max(triggerProgress, progress) : Math.min(triggerProgress, progress);
  triggerProgress = adjustLoadingProgress(triggerProgress,signedPressure,delta,progressMinimum,progressMaximum);
  $("progress").value = triggerProgress;
  $("progressValue").textContent = formatProgress(triggerProgress);
  if (now - lastTriggerProgressSent >= 100 || triggerProgress >= progressMaximum || triggerProgress <= progressMinimum) sendTriggerProgress(now);
}

function sendTriggerProgress(now = performance.now()) {
  client.sendAction({ type:"SET_PROGRESS", value:triggerProgress });
  lastTriggerProgressSent = now;
}

function finishTriggerProgress() {
  if (!triggerProgressActive) return;
  sendTriggerProgress();
  recordRehearsal("action", { detail:`${triggerProgressDirection > 0 ? "RT FORWARD" : "LT REVERSE"} PROGRESS STOP · ${formatProgress(triggerProgress)}` });
  triggerProgressActive = false;
  triggerProgressDirection = 0;
}

function formatProgress(value) {
  const rounded = Math.floor((Number(value) || 0)*10)/10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}

async function enableMidi() {
  if (!navigator.requestMIDIAccess) {
    $("midiStatus").textContent = "WebMIDI unavailable — use Chromium on Mac";
    return;
  }
  try {
    const access = await navigator.requestMIDIAccess({ sysex: false });
    const bindInputs = () => {
      for (const input of access.inputs.values()) input.onmidimessage = handleMidi;
      midiInputConnected = access.inputs.size > 0;
      $("midiDot").classList.toggle("online", access.inputs.size > 0);
      $("midiStatus").textContent = access.inputs.size ? `${access.inputs.size} input(s) · waiting for CC` : "Enabled · no MIDI input";
    };
    access.onstatechange = bindInputs;
    bindInputs();
    $("enableMidi").textContent = "MIDI ENABLED — CC ONLY";
    $("enableMidi").classList.add("active");
  } catch (error) {
    $("midiStatus").textContent = `Permission unavailable: ${error.message}`;
  }
}

function handleMidi(event) {
  const message = decodeControlChange(event.data);
  if (!message) return; // Strictly ignore Note, Aftertouch, Program and Pitch messages.
  const { channel, cc, value, normalized } = message;
  const mapping = midiMapping(cc);
  $("midiDot").classList.add("online");
  $("midiStatus").textContent = `CH ${channel} · CC ${cc} · ${value} · ${mapping}`;

  if (mapping === "progress") {
    const progress = Math.round(normalized * 100);
    if (progress !== lastMidiProgress) { act("SET_PROGRESS", { value: progress }); lastMidiProgress = progress; }
  } else if (mapping === "cue-select" && $("armMidiCue").checked) {
    const cueIndex = cueIndexFromCC(value, cues.length);
    if (cueIndex !== lastMidiCue) { act("SELECT_CUE", { cueId: cues[cueIndex].id }); lastMidiCue = cueIndex; }
  } else if (mapping !== "unmapped") {
    client.sendInput({ source: "midi", cc, value, normalized, mapping });
  }
}

function midiMapping(cc) {
  if (cc === Number($("ccProgress").value)) return "progress";
  if (cc === Number($("ccIntensity").value)) return "intensity";
  if (cc === Number($("ccFishSpeed").value)) return "fish-speed";
  if (cc === Number($("ccFishDepth").value)) return "fish-depth";
  if (cc === Number($("ccCue").value)) return "cue-select";
  return "unmapped";
}

function deadzone(value) {
  const threshold = .12;
  return Math.abs(value) < threshold ? 0 : Math.sign(value) * (Math.abs(value) - threshold) / (1 - threshold);
}

function bindVirtualCC(id, mapping, cc) {
  const slider = $(id);
  const output = slider.nextElementSibling;
  slider.addEventListener("input", () => {
    const value = Number(slider.value);
    output.value = value;
    client.sendInput({ source: "midi", cc, value, normalized: value / 127, mapping });
  });
}

function renderMapping(state) {
  if (!state?.surfaces) return;
  $("surfaceSelect").value = state.calibrationSurface;
  const corner = Number($("cornerSelect").value);
  const point = state.surfaces[state.calibrationSurface][corner];
  $("surfaceX").value = point[0]; $("surfaceY").value = point[1];
  $("surfaceXValue").value = point[0].toFixed(3); $("surfaceYValue").value = point[1].toFixed(3);
}

function openKeystoneDialog(surface = "screen") {
  $("keystoneDialog").hidden = false;
  document.body.classList.add("modal-open");
  $("surfaceSelect").value = surface;
  act("SET_CALIBRATION_SURFACE", { surface });
  if (!currentState?.calibration) act("SET_CALIBRATION", { value:true });
  renderKeystonePreviews(currentState);
  $("keystoneClose").focus();
}

function closeKeystoneDialog() {
  $("keystoneDialog").hidden = true;
  document.body.classList.remove("modal-open");
  keystoneDrag = null;
}

function renderKeystonePreviews(state) {
  if (!state?.surfaces) return;
  const deviceIds = { screen:"mac-projector-wall", floor:"mac-projector-floor" };
  for (const surface of SURFACE_ORDER) {
    const quad = state.surfaces[surface].map((point) => [...point]);
    for (let corner = 0; corner < quad.length; corner++) {
      const key = `${surface}:${corner}`;
      const pending = pendingKeystonePoints.get(key);
      if (!pending) continue;
      const acknowledged = Math.abs(quad[corner][0] - pending.x) < .0001 && Math.abs(quad[corner][1] - pending.y) < .0001;
      const activelyDragging = keystoneDrag?.surface === surface && keystoneDrag?.corner === corner;
      if (acknowledged) pendingKeystonePoints.delete(key);
      else if (activelyDragging || performance.now() - pending.createdAt < 2500) quad[corner] = [pending.x, pending.y];
      else pendingKeystonePoints.delete(key);
    }
    const device = latestDevices.find((item) => item.deviceId === deviceIds[surface]);
    const width = Number(device?.telemetry?.width) || 16;
    const height = Number(device?.telemetry?.height) || 9;
    const sizeLabel = device?.telemetry ? `${width} × ${height}` : "16:9 FALLBACK";
    document.querySelectorAll(`[data-projector-size="${surface}"]`).forEach((label) => { label.textContent = sizeLabel; });
    document.querySelectorAll(`.keystone-stage[data-surface="${surface}"]`).forEach((stage) => {
      stage.style.aspectRatio = `${width} / ${height}`;
      stage.querySelector(".keystone-plane").style.clipPath = `polygon(${quad.map(([x, y]) => `${x * 100}% ${y * 100}%`).join(",")})`;
      stage.querySelectorAll(".keystone-handle").forEach((handle) => {
        const [x, y] = quad[Number(handle.dataset.corner)];
        handle.style.left = `${x * 100}%`;
        handle.style.top = `${y * 100}%`;
      });
    });
  }
}

function beginKeystoneDrag(event) {
  beginKeystoneGesture(event.currentTarget, event.pointerId, "pointer");
  event.currentTarget.setPointerCapture?.(event.pointerId);
  event.preventDefault();
  event.stopPropagation();
}

function moveKeystoneDrag(event) {
  if (!keystoneDrag || keystoneDrag.input !== "pointer") return;
  updateKeystoneDrag(event, false);
}

function endKeystoneDrag(event) {
  if (!keystoneDrag || keystoneDrag.input !== "pointer") return;
  if (event.type !== "pointercancel") updateKeystoneDrag(event, true);
  keystoneDrag = null;
}

function beginMouseKeystoneDrag(event) {
  if (keystoneDrag) return;
  beginKeystoneGesture(event.currentTarget, "mouse", "mouse");
  event.preventDefault();
}

function moveMouseKeystoneDrag(event) {
  if (!keystoneDrag || keystoneDrag.input !== "mouse") return;
  updateKeystoneDrag(event, false);
}

function endMouseKeystoneDrag(event) {
  if (!keystoneDrag || keystoneDrag.input !== "mouse") return;
  updateKeystoneDrag(event, true);
  keystoneDrag = null;
}

function beginKeystoneGesture(handle, pointerId, input) {
  const stage = handle.closest(".keystone-stage");
  const surface = stage.dataset.surface;
  const corner = Number(handle.dataset.corner);
  keystoneDrag = { stage, surface, corner, pointerId, input, lastPoint:null };
  $("surfaceSelect").value = surface;
  $("cornerSelect").value = String(corner);
  if (currentState?.calibrationSurface !== surface) client.sendAction({ type:"SET_CALIBRATION_SURFACE", surface });
  if (!currentState?.calibration) client.sendAction({ type:"SET_CALIBRATION", value:true });
}

function updateKeystoneDrag(event, final) {
  if (!final && performance.now() - lastKeystoneDragSent < 16) return;
  lastKeystoneDragSent = performance.now();
  const { stage, surface, corner } = keystoneDrag;
  const rect = stage.getBoundingClientRect();
  const [x, y] = separatedKeystonePoint(surface, corner, (event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height, rect);
  const previous = keystoneDrag.lastPoint;
  if (previous && Math.abs(previous[0] - x) < .0001 && Math.abs(previous[1] - y) < .0001) return;
  keystoneDrag.lastPoint = [x, y];
  pendingKeystonePoints.set(`${surface}:${corner}`, { x, y, createdAt:performance.now() });
  previewKeystonePoint(surface, corner, x, y);
  client.sendAction({ type:"SET_SURFACE_POINT", surface, corner, x, y });
  event.preventDefault?.();
}

function previewKeystonePoint(surface, corner, x, y) {
  const quad = (currentState?.surfaces?.[surface] || []).map((point) => [...point]);
  if (quad.length !== 4) return;
  quad[corner] = [x, y];
  document.querySelectorAll(`.keystone-stage[data-surface="${surface}"]`).forEach((stage) => {
    stage.querySelector(".keystone-plane").style.clipPath = `polygon(${quad.map(([pointX, pointY]) => `${pointX * 100}% ${pointY * 100}%`).join(",")})`;
    const handle = stage.querySelector(`.keystone-handle[data-corner="${corner}"]`);
    if (handle) {
      handle.style.left = `${x * 100}%`;
      handle.style.top = `${y * 100}%`;
    }
  });
}

function separatedKeystonePoint(surface, corner, x, y, rect) {
  let px = Math.min(1, Math.max(0, x));
  let py = Math.min(1, Math.max(0, y));
  const points = currentState?.surfaces?.[surface] || [];
  const minimum = 30;
  for (let index = 0; index < points.length; index++) {
    if (index === corner) continue;
    const dx = (px - points[index][0]) * rect.width;
    const dy = (py - points[index][1]) * rect.height;
    const distance = Math.hypot(dx, dy);
    if (distance >= minimum) continue;
    const angle = distance > .001 ? Math.atan2(dy, dx) : (corner - index) * Math.PI / 2;
    px = points[index][0] + Math.cos(angle) * minimum / rect.width;
    py = points[index][1] + Math.sin(angle) * minimum / rect.height;
  }
  return [Math.min(1, Math.max(0, px)), Math.min(1, Math.max(0, py))];
}

function updateSurfaceCoordinate(axis, value) {
  if (!currentState?.surfaces) return;
  const surface = $("surfaceSelect").value;
  const corner = Number($("cornerSelect").value);
  const [currentX, currentY] = currentState.surfaces[surface][corner];
  act("SET_SURFACE_POINT", { surface, corner, x: axis === "x" ? value : currentX, y: axis === "y" ? value : currentY });
}

function nudgeSurface(dx, dy) {
  if (!currentState?.surfaces) return;
  const surface = $("surfaceSelect").value;
  const corner = Number($("cornerSelect").value);
  const [x, y] = currentState.surfaces[surface][corner];
  act("SET_SURFACE_POINT", { surface, corner, x: Math.min(1, Math.max(0, x + dx)), y: Math.min(1, Math.max(0, y + dy)) });
}

async function refreshAssets() {
  $("refreshAssets").disabled = true;
  try {
    const response = await fetch("/api/preflight", { cache: "no-store" });
    const report = await response.json();
    latestAssetReport = report;
    $("assetSummary").textContent = report.ready ? `READY · ${report.readyCount}/${report.assets.length} VALID LOCAL ASSETS` : `NOT READY · ${report.missing} MISSING · ${report.invalid} INVALID`;
    $("assetSummary").classList.toggle("ready", report.ready);
    $("assetList").replaceChildren(...report.assets.map((asset) => {
      const row = document.createElement("div");
      row.className = `asset-item ${asset.ready ? "present" : ""}`;
      const detail = asset.errors?.length ? ` · ${asset.errors.join(" · ")}` : "";
      const dot = document.createElement("span");
      dot.className = `status-dot ${asset.ready ? "online" : ""}`;
      const description = document.createElement("span");
      description.textContent = asset.label;
      const metadata = document.createElement("small");
      metadata.textContent = `${asset.cues.join(", ")} · ${asset.owner} · ${asset.path}${detail}`;
      description.append(metadata);
      const assetState = document.createElement("span");
      assetState.className = "asset-state";
      assetState.textContent = asset.ready ? formatBytes(asset.bytes) : asset.present ? "INVALID" : "MISSING";
      row.append(dot, description, assetState);
      return row;
    }));
  } catch {
    latestAssetReport = null;
    $("assetSummary").textContent = "PREFLIGHT UNAVAILABLE";
  } finally {
    $("refreshAssets").disabled = false;
  }
}

async function runTechCheck() {
  $("runTechCheck").disabled = true;
  $("techSummary").textContent = "RUNNING · waiting for authoritative server status…";
  try {
    const [statusResponse, assetResponse] = await Promise.all([
      fetch("/api/status", { cache: "no-store" }),
      fetch("/api/preflight", { cache: "no-store" })
    ]);
    if (!statusResponse.ok || !assetResponse.ok) throw new Error("server preflight unavailable");
    const status = await statusResponse.json();
    latestAssetReport = await assetResponse.json();
    latestDevices = status.devices;
    const gamepadConnected = [...navigator.getGamepads?.() || []].some(Boolean);
    const certification = evaluateTechnicalCheck({
      devices: latestDevices,
      assetReport: latestAssetReport,
      operatorRtt,
      gamepadConnected,
      ipadOrderConfirmed: $("confirmIpadOrder").checked,
      midiEnabled: midiInputConnected,
      now: status.serverTime || Date.now()
    });
    lastTechReport = {
      format: "wetware-technical-certification",
      version: 1,
      generatedAt: new Date(certification.checkedAt).toISOString(),
      serverHost: location.host,
      production,
      show: {
        cueId: status.state.cueId,
        cueIndex: status.state.cueIndex,
        progress: status.state.progress,
        blackout: status.state.blackout,
        frozen: status.state.frozen,
        calibration: status.state.calibration,
        revision: status.state.revision
      },
      controllers: { operatorRtt, gamepadConnected, ipadOrderConfirmed:$("confirmIpadOrder").checked, midiInputConnected },
      devices: latestDevices,
      media: latestAssetReport,
      certification
    };
    lastCertificationFingerprint = certificationFingerprint(latestDevices);
    renderTechCheck(certification);
    $("downloadTechReport").disabled = false;
  } catch (error) {
    lastTechReport = null;
    $("techSummary").className = "tech-summary failed";
    $("techSummary").textContent = `CHECK FAILED TO RUN · ${error.message}`;
    $("downloadTechReport").disabled = true;
  } finally {
    $("runTechCheck").disabled = false;
  }
}

function renderTechCheck(certification) {
  $("techSummary").className = `tech-summary ${certification.ready ? "ready" : "failed"}`;
  $("techSummary").textContent = certification.ready
    ? `SHOW TECH READY · ${certification.passed} PASSED · ${certification.warnings} ADVISORIES`
    : `NOT READY · ${certification.failed} REQUIRED FAILURES · ${certification.warnings} ADVISORIES`;
  $("techChecks").replaceChildren(...certification.checks.map((check) => {
    const row = document.createElement("div");
    row.className = `tech-check ${check.status}`;
    const dot = document.createElement("i");
    const label = document.createElement("strong");
    label.textContent = check.label;
    const detail = document.createElement("span");
    detail.textContent = check.detail;
    row.append(dot, label, detail);
    return row;
  }));
}

function downloadTechReport() {
  if (!lastTechReport) return;
  const blob = new Blob([`${JSON.stringify(lastTechReport, null, 2)}\n`], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `wetware-tech-report-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function certificationFingerprint(devices) {
  return JSON.stringify(devices.map((device) => ({
    id: device.id,
    deviceId: device.deviceId,
    role: device.role,
    width: device.telemetry?.width || 0,
    height: device.telemetry?.height || 0,
    fullscreen: Boolean(device.telemetry?.fullscreen),
    visible: Boolean(device.telemetry?.visible),
    displayMode: device.telemetry?.displayMode || "unknown",
    mediaProbe: device.deviceId.startsWith("mac-projector-") ? {
      status: device.telemetry?.mediaProbe?.status || "unknown",
      checked: device.telemetry?.mediaProbe?.checked || 0,
      total: device.telemetry?.mediaProbe?.total || 0,
      failed: device.telemetry?.mediaProbe?.failed || 0,
      failures: device.telemetry?.mediaProbe?.failures || []
    } : null
  })).sort((a, b) => `${a.deviceId}:${a.id}`.localeCompare(`${b.deviceId}:${b.id}`)));
}

function markTechReportStale(reason) {
  if (!lastTechReport) return;
  lastTechReport = null;
  lastCertificationFingerprint = null;
  $("techSummary").className = "tech-summary";
  $("techSummary").textContent = `STALE · ${reason} · RUN TECH CHECK AGAIN`;
  $("downloadTechReport").disabled = true;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
