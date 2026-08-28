import { cues } from "/show/cues.js";
import { assetManifest } from "/show/assets.js";
import { connectShowClient } from "/common/client.js";
import { cssMatrix3dForQuad } from "/common/homography.js";
import { cueSurface, SURFACE_LABELS } from "/show/surfaces.js";
import { normalizeFaceManifest, normalizeSlideshowContent, resolveMediaAssetUrl, validateMediaJson } from "/common/media-content.js";
import { effectiveBlackout, EMERGENCY_CHANNEL, normalizeEmergencyMessage, reconcileEmergencyBlackout } from "/common/emergency.js";
import { nuggetPopTransition, slideshowVocabulary } from "/show/slideshow.js";
import { cueBelongsToOutput, normalizeProjectorOutput, PROJECTOR_OUTPUT_LABELS, shouldShowFloorFishIndicator, shouldShowPersistentFloorLoading } from "/show/outputs.js";
import { wetwareInstallationMessage } from "/common/loading-copy.js";
import { normalizeProjectorPointer, stoneMaskBounds } from "/show/scene-settings.js";
import { budgetChaosTransition, formatBudgetUsd } from "/show/budget-chaos.js";
import { stageFishIndicatorX } from "/common/aquarium.js";

const words = slideshowVocabulary;
const projectorOutput = normalizeProjectorOutput(new URLSearchParams(location.search).get("output"));
const projectorLabel = PROJECTOR_OUTPUT_LABELS[projectorOutput];
const projectorDeviceId = `mac-projector-${projectorOutput}`;
const projectorPlane = projectorOutput === "wall" ? "screen" : "floor";
let state = { cueIndex: 0, progress: 0, blackout: false, frozen: false, calibration: false, cameraDeviceId: "", cameraDeviceLabel: "", pulse: 0, nuggetIndex: 0, updatedAt: Date.now() };
let clock = 0;
let cameraReady = false;
let cameraLabel = "";
let cameraError = "";
let cameraRequest = 0;
let outputArmed = false;
let activeCueId = null;
let activeDataUrl = null;
let activeCueData = null;
let mediaProbe = { status:"checking", checked:0, total:assetManifest.length, failed:0, checkedAt:0, failures:[] };
let mediaProbeRunning = false;
let emergencyBlackoutOverride = null;
const live = {
  intensity:.71, gamepadActive:false, fishX:.12, faceX:.5, faceY:.5,
  axisX:0, axisY:0, axisZ:0, axisRX:0,
  leftTrigger:0, rightTrigger:0, leftBumper:false, rightBumper:false, start:false
};
const media = document.getElementById("mediaLayer");
const auxMedia = document.getElementById("auxMediaLayer");
const camera = document.getElementById("cameraLayer");
const youtube = document.getElementById("youtubeLayer");
const wallCameraSetup = document.getElementById("wallCameraSetup");
const wallCameraSelect = document.getElementById("wallCameraSelect");
const wallCameraRefresh = document.getElementById("wallCameraRefresh");
const wallCameraStatus = document.getElementById("wallCameraStatus");
const LOCAL_WALL_CAMERA_KEY = "wetware-wall-camera-v1";
let localCameraDeviceId = "";
let localCameraDeviceLabel = "";
let activeCameraSelectionKey = "";
const auxCanvas = document.getElementById("auxCanvas");
const auxContext = auxCanvas.getContext("2d");
const emergencyChannel = new BroadcastChannel(EMERGENCY_CHANNEL);
const dataCache = new Map();
const slideImages = new Map();
const faceImages = new Map();
let faceImageIndex = -1;
let lastFacePulse = -1;
let lastFaceCycle = -1;
let nuggetPopStartedAt = -Infinity;
const kalaPointer = { x:.5,y:.5,active:false };
const kalaRemote = { x:.5,y:.5,active:false };

document.title = `Wetware — ${projectorLabel}`;
document.getElementById("outputBadge").textContent = projectorLabel;
document.getElementById("arm").textContent = `ARM ${projectorLabel} + FULLSCREEN`;
restoreLocalCameraSelection();
if (projectorOutput === "wall") {
  wallCameraRefresh.onclick = refreshLocalCameraInputs;
  wallCameraSelect.onchange = async () => {
    localCameraDeviceId = wallCameraSelect.value;
    localCameraDeviceLabel = localCameraDeviceId ? wallCameraSelect.selectedOptions[0]?.textContent || "" : "";
    storeLocalCameraSelection();
    wallCameraStatus.textContent = "OPENING LOCAL CAMERA…";
    await startCamera(localCameraDeviceId,localCameraDeviceLabel);
  };
}

const client = connectShowClient({
  role: "projector", deviceId: projectorDeviceId,
  getTelemetry: () => ({
    mediaProbe,
    ...(projectorOutput === "wall" ? { cameraInput:{ ready:cameraReady, label:cameraLabel, error:cameraError } } : {})
  }),
  onState(next) {
    const previousCue = cues[state.cueIndex] || cues[0];
    const nextCue = cues[next.cueIndex] || cues[0];
    if (nextCue.projector === "slideshow" && (previousCue.projector !== "slideshow" || next.nuggetIndex !== state.nuggetIndex)) {
      nuggetPopStartedAt = performance.now();
    }
    const previousCamera = effectiveCameraSelection(state.cameraDeviceId,state.cameraDeviceLabel);
    const nextCamera = effectiveCameraSelection(next.cameraDeviceId,next.cameraDeviceLabel);
    const cameraChanged = cameraSelectionKey(nextCamera.deviceId,nextCamera.label) !== cameraSelectionKey(previousCamera.deviceId,previousCamera.label);
    state = next;
    emergencyBlackoutOverride = reconcileEmergencyBlackout(emergencyBlackoutOverride, next.blackout);
    updateBlackoutClass();
    const cue = effectiveProjectorCue(cues[next.cueIndex] || cues[0]);
    renderWallCameraSetup();
    const routedCue = cueBelongsToOutput(cue, projectorOutput) ? cue : idleCue(cue);
    syncMedia(routedCue); syncYoutube(routedCue); syncCueData(routedCue); applySurface();
    if (projectorOutput === "wall" && outputArmed && cameraChanged) startCamera(nextCamera.deviceId,nextCamera.label);
  },
  onInput:applyProjectorInput,
  onInputSnapshot(inputs) {
    live.intensity = .71;
    live.gamepadActive = false;
    live.fishX = .12;
    live.faceX = .5;
    live.faceY = .5;
    live.axisX = 0;
    live.axisY = 0;
    live.axisZ = 0;
    live.axisRX = 0;
    live.leftTrigger = 0;
    live.rightTrigger = 0;
    live.leftBumper = false;
    live.rightBumper = false;
    live.start = false;
    kalaRemote.active=false;
    for (const input of inputs) applyProjectorInput(input);
  },
  onConnection(status) {
    const badge = document.getElementById("networkBadge");
    badge.querySelector("span").className = `status-dot ${status}`;
    badge.lastElementChild.textContent = status.toUpperCase();
  }
});

function applyProjectorInput(input) {
  if(input.source==="midi"&&input.mapping==="intensity") live.intensity=input.normalized;
  if(input.source==="kala") Object.assign(kalaRemote,{ x:Number(input.x)||0,y:Number(input.y)||0,active:Boolean(input.active) });
  if(input.source==="gamepad") {
    live.gamepadActive = Boolean(input.active);
    live.fishX = Math.max(0,Math.min(1,Number(input.x) || 0));
    live.faceX = (Number(input.axisX || 0) + 1) / 2;
    live.faceY = (Number(input.axisZ || 0) + 1) / 2;
    live.axisX = Number(input.axisX || 0);
    live.axisY = Number(input.axisY || 0);
    live.axisZ = Number(input.axisZ || 0);
    live.axisRX = Number(input.axisRX || 0);
    live.leftTrigger = Number(input.leftTrigger || 0);
    live.rightTrigger = Number(input.rightTrigger || 0);
    live.leftBumper = Boolean(input.leftBumper);
    live.rightBumper = Boolean(input.rightBumper);
    live.start = Boolean(input.start);
  }
}

refreshMediaProbe();
setInterval(refreshMediaProbe, 60000);

document.getElementById("arm").onclick = () => armOutput();
window.addEventListener("pointermove",(event)=>{
  if(projectorOutput!=="wall") return;
  Object.assign(kalaPointer,normalizeProjectorPointer(event.clientX,event.clientY,window.innerWidth,window.innerHeight));
  kalaPointer.active=true;
});

async function armOutput() {
  outputArmed = true;
  document.getElementById("arm").classList.add("armed");
  await document.documentElement.requestFullscreen?.().catch(() => {});
  const cue = effectiveProjectorCue(cues[state.cueIndex] || cues[0]);
  media.muted = cue.audio === false || !cueBelongsToOutput(cue, projectorOutput);
  auxMedia.muted = true;
  const selectedCamera = effectiveCameraSelection(state.cameraDeviceId,state.cameraDeviceLabel);
  if (projectorOutput === "wall" && (!cameraReady || activeCameraSelectionKey !== cameraSelectionKey(selectedCamera.deviceId,selectedCamera.label))) {
    await startCamera(selectedCamera.deviceId,selectedCamera.label);
  }
  syncMedia(cueBelongsToOutput(cue, projectorOutput) ? cue : idleCue(cue));
}

async function startCamera(deviceId = "",deviceLabel = "") {
  const request = ++cameraRequest;
  const previous = camera.srcObject;
  camera.srcObject = null;
  previous?.getTracks?.().forEach((track) => track.stop());
  activeCameraSelectionKey = cameraSelectionKey(deviceId,deviceLabel);
  cameraReady = false;
  cameraLabel = "";
  cameraError = "";
  client.refreshTelemetry();
  if (!navigator.mediaDevices?.getUserMedia) {
    cameraError = "CAMERA INPUT IS NOT AVAILABLE IN THIS BROWSER";
    client.refreshTelemetry();
    return false;
  }
  try {
    const localDeviceId = await resolveLocalCameraDeviceId(deviceId,deviceLabel);
    if (deviceLabel && !localDeviceId) throw new Error(`SELECTED CAMERA NOT AVAILABLE HERE · ${deviceLabel}`);
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width:{ ideal:1920 },
        height:{ ideal:1080 },
        ...(localDeviceId ? { deviceId:{ exact:localDeviceId } } : {})
      },
      audio:false
    });
    if (request !== cameraRequest) {
      stream.getTracks().forEach((track) => track.stop());
      return false;
    }
    camera.srcObject = stream;
    await camera.play();
    const track = stream.getVideoTracks()[0];
    cameraReady = true;
    cameraLabel = track?.label || "CAMERA";
    cameraError = "";
    updateLocalCameraStatus();
    client.refreshTelemetry();
    track?.addEventListener("ended", () => {
      if (camera.srcObject !== stream) return;
      cameraReady = false;
      cameraLabel = "";
      cameraError = "CAMERA DISCONNECTED";
      updateLocalCameraStatus();
      client.refreshTelemetry();
    });
    return true;
  } catch (error) {
    if (request !== cameraRequest) return false;
    camera.srcObject?.getTracks?.().forEach((track) => track.stop());
    camera.srcObject = null;
    cameraReady = false;
    cameraLabel = "";
    cameraError = String(error?.message || "CAMERA FAILED");
    updateLocalCameraStatus();
    client.refreshTelemetry();
    return false;
  }
}

function effectiveCameraSelection(deviceId = "",label = "") {
  if (localCameraDeviceId || localCameraDeviceLabel) return { deviceId:localCameraDeviceId,label:localCameraDeviceLabel };
  return { deviceId,label };
}

function restoreLocalCameraSelection() {
  if (projectorOutput !== "wall") return;
  try {
    const saved = JSON.parse(localStorage.getItem(LOCAL_WALL_CAMERA_KEY) || "{}");
    localCameraDeviceId = String(saved.deviceId || "").slice(0,256);
    localCameraDeviceLabel = String(saved.label || "").slice(0,120);
  } catch {}
}

function storeLocalCameraSelection() {
  try { localStorage.setItem(LOCAL_WALL_CAMERA_KEY,JSON.stringify({ deviceId:localCameraDeviceId,label:localCameraDeviceLabel })); } catch {}
}

function renderWallCameraSetup() {
  const visible = projectorOutput === "wall" && Boolean(state.calibration);
  wallCameraSetup.hidden = !visible;
  document.body.classList.toggle("camera-setup-visible",visible);
  document.body.classList.toggle("local-camera-setup",visible && cameraReady);
  if (visible) updateLocalCameraStatus();
}

async function refreshLocalCameraInputs() {
  wallCameraRefresh.disabled = true;
  wallCameraStatus.textContent = "CHECKING THIS WINDOW…";
  let permissionStream;
  try {
    permissionStream = await navigator.mediaDevices.getUserMedia({ video:true,audio:false });
    permissionStream.getTracks().forEach((track) => track.stop());
    permissionStream = null;
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "videoinput");
    wallCameraSelect.replaceChildren(
      new Option("DEFAULT CAMERA",""),
      ...devices.map((device,index) => new Option(device.label || `CAMERA ${index+1}`,device.deviceId))
    );
    const exact = devices.find((device) => device.deviceId === localCameraDeviceId);
    const byLabel = localCameraDeviceLabel
      ? devices.find((device) => normalizeCameraLabel(device.label) === normalizeCameraLabel(localCameraDeviceLabel))
      : null;
    const selected = exact || byLabel;
    if (selected) {
      localCameraDeviceId = selected.deviceId;
      localCameraDeviceLabel = selected.label;
      wallCameraSelect.value = selected.deviceId;
      storeLocalCameraSelection();
    } else {
      wallCameraSelect.value = "";
    }
    wallCameraStatus.textContent = `${devices.length} LOCAL CAMERA${devices.length === 1 ? "" : "S"} FOUND`;
  } catch (error) {
    wallCameraStatus.textContent = `CAMERA ACCESS FAILED · ${error?.message || "UNKNOWN ERROR"}`;
  } finally {
    permissionStream?.getTracks?.().forEach((track) => track.stop());
    wallCameraRefresh.disabled = false;
  }
}

function updateLocalCameraStatus() {
  if (projectorOutput !== "wall") return;
  document.body.classList.toggle("local-camera-setup",!wallCameraSetup.hidden && cameraReady);
  if (cameraReady) wallCameraStatus.textContent = `LOCAL ACTIVE · ${cameraLabel || "CAMERA"}`;
  else if (cameraError) wallCameraStatus.textContent = `LOCAL FAILED · ${cameraError}`;
  else if (localCameraDeviceLabel) wallCameraStatus.textContent = `LOCAL SELECTED · ${localCameraDeviceLabel}`;
  else wallCameraStatus.textContent = "SELECT ON THIS WINDOW";
}

function cameraSelectionKey(deviceId = "",deviceLabel = "") {
  return `${String(deviceId || "")}\n${String(deviceLabel || "")}`;
}

async function resolveLocalCameraDeviceId(deviceId = "",deviceLabel = "") {
  if (!deviceId && !deviceLabel) return "";
  let devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "videoinput");
  const direct = devices.find((device) => device.deviceId === deviceId);
  if (direct) return direct.deviceId;
  if (!deviceLabel) return deviceId;
  if (!devices.some((device) => device.label)) {
    const permissionStream = await navigator.mediaDevices.getUserMedia({ video:true,audio:false });
    permissionStream.getTracks().forEach((track) => track.stop());
    devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "videoinput");
  }
  const wanted = normalizeCameraLabel(deviceLabel);
  const match = devices.find((device) => normalizeCameraLabel(device.label) === wanted)
    || devices.find((device) => {
      const available = normalizeCameraLabel(device.label);
      return available && (available.includes(wanted) || wanted.includes(available));
    });
  return match?.deviceId || "";
}

function normalizeCameraLabel(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
}

document.addEventListener("keydown", async (event) => {
  if (event.key.toLowerCase() === "f") {
    event.preventDefault();
    if (document.fullscreenElement) await document.exitFullscreen?.().catch(()=>{});
    else await armOutput();
    return;
  }
});

document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement && !outputArmed) document.getElementById("arm").classList.remove("armed");
});

window.setup = () => {
  const canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent("stage");
  canvas.id("projectorCanvas");
  pixelDensity(1);
  textFont("monospace");
  noStroke();
  resizeAuxCanvas();
  applySurface();
};

window.windowResized = () => {
  resizeCanvas(windowWidth, windowHeight);
  resizeAuxCanvas();
  requestAnimationFrame(applySurface);
};

window.draw = () => {
  clock = ((state.frozen ? state.updatedAt : client.serverNow()) / 1000) % 100000;
  const cue = effectiveProjectorCue(cues[state.cueIndex] || cues[0]);
  background(0);
  const routed = cueBelongsToOutput(cue, projectorOutput);
  const calibrationVisible = state.calibration && emergencyBlackoutOverride !== true;
  if (calibrationVisible) drawCalibration();
  else if (isHouseSetupPreview(cue)) drawSetupPreview();
  else if (!isBlackoutActive() && routed) drawMode(cue.projector, cue);
  drawAuxiliary(cue);
};
emergencyChannel.addEventListener("message", ({ data }) => {
  const message = normalizeEmergencyMessage(data);
  if (!message) return;
  emergencyBlackoutOverride = message.value;
  updateBlackoutClass();
});

function isBlackoutActive() {
  return effectiveBlackout(state.blackout, emergencyBlackoutOverride);
}

function idleCue(cue) {
  return { id:`${cue.id}:idle:${projectorOutput}`, projector:"black", audio:false };
}

function effectiveProjectorCue(cue) {
  if (shouldShowFloorFishIndicator(cue,projectorOutput)) {
    return { id:`${cue.id}:floor-fish-indicator`, projector:"fish-indicator", surface:"floor", audio:false };
  }
  if (!shouldShowPersistentFloorLoading(cue, state, projectorOutput)) return cue;
  return { id:`${cue.id}:floor-loading-always`, projector:"loading", surface:"floor", audio:false };
}

function updateBlackoutClass() {
  document.body.classList.toggle("output-black", isBlackoutActive());
  const cue = effectiveProjectorCue(cues[state.cueIndex] || cues[0]);
  syncYoutube(cueBelongsToOutput(cue, projectorOutput) ? cue : idleCue(cue));
}

function drawMode(mode, cue) {
  if (mode === "hero") drawMediaWithFallback(cue, drawHero);
  else if (mode === "preshow-fade") drawPreshowFade(cue);
  else if (mode === "loading") drawLoading();
  else if (mode === "fish-indicator") drawFishIndicator();
  else if (mode === "slideshow") drawSlideshow(cue);
  else if (mode === "underwater") drawUnderwater();
  else if (mode === "spreadsheet") drawSpreadsheet();
  else if (mode === "anatomy") drawMediaWithFallback(cue, drawAnatomy);
  else if (mode === "anatomy-face") drawMediaWithFallback(cue, drawAnatomy);
  else if (mode === "organs") drawMediaWithFallback(cue, drawOrgans);
  else if (mode === "stone-mask") drawStoneComposite(cue);
  else if (mode === "kala-face") background(0);
  else if (mode === "camera") drawCamera();
  else if (mode === "video") drawVideo(cue);
  else if (mode === "youtube") background(0);
}

function drawPreshowFade(cue) {
  const duration = Math.max(.1, Number(cue.fadeDuration) || 4);
  const elapsed = Math.max(0, (client.serverNow() - Number(state.updatedAt || 0)) / 1000);
  const phase = constrain(elapsed / duration, 0, 1);
  const level = 1 - phase * phase * (3 - 2 * phase);
  media.volume = level;
  if (media.readyState >= 2 && media.currentSrc && level > 0) {
    drawingContext.save();
    drawingContext.globalAlpha = level;
    drawDomMediaFrame(drawingContext, media, width, height, cue.fit || "cover");
    drawingContext.restore();
  }
  if (phase >= 1 && !media.paused) media.pause();
}

function drawHero() {
  const pulse = sin(clock * 1.3) * .5 + .5;
  background(42 + 22 * pulse, 10, 62 + 28 * pulse);
  for (let i=0;i<24;i++) {
    fill(255, 70, 110, 15); ellipse(noise(i,clock*.08)*width, noise(i+80,clock*.08)*height, 180+i*9);
  }
  fill(240); textAlign(CENTER,CENTER); textSize(min(width*.105,150)); textStyle(BOLD); text("WETWARE<3",width/2,height*.46);
  fill(113,255,75); textSize(min(width*.015,20)); textStyle(NORMAL); text("THE OLDEST TECHNOLOGY: LOVE",width/2,height*.58);
}

function drawLoading() {
  background(0); fill(113,255,75); textAlign(LEFT,BASELINE);
  const margin = width*.08, barW = width*.84, barH = max(24,height*.055);
  const message = wetwareInstallationMessage(state.progress);
  const headingSize = min(width*.055,72);
  textStyle(BOLD); textSize(headingSize);
  const measuredHeadingWidth = textWidth(message);
  if (measuredHeadingWidth > barW) textSize(headingSize * barW / measuredHeadingWidth);
  text(message,margin,height*.37);
  drawAnimatedLoadingBar(margin,height*.48,barW,barH,state.progress);
  const progressLabel = floor((Number(state.progress)||0)*10)/10;
  fill(113,255,75); textFont("monospace"); textSize(min(width*.06,84)); text(`${Number.isInteger(progressLabel)?progressLabel.toFixed(0):progressLabel.toFixed(1)}%`,margin,height*.68);
  fill(113,255,75,175); textSize(min(width*.014,17)); text("DO NOT DISCONNECT YOUR BODY",margin,height*.75);
}

function drawFishIndicator() {
  const fishX=live.gamepadActive ? live.fishX : (clock*.018)%1;
  const diameter=Math.max(12,Math.min(24,Math.min(width,height)*.018));
  const squareSize=Math.min(height*.34,width*.24);
  const trackWidth=squareSize*3;
  const trackLeft=(width-trackWidth)*.5;
  const trackTop=(height-squareSize)*.5;
  const markerInset=diameter*.65;
  const x=trackLeft+markerInset+stageFishIndicatorX(fishX)*(trackWidth-markerInset*2);
  const y=height*.5;
  noFill();
  stroke(238,255,232,72);
  strokeWeight(Math.max(2,Math.min(width,height)*.002));
  rect(trackLeft,trackTop,trackWidth,squareSize);
  line(trackLeft+squareSize,trackTop,trackLeft+squareSize,trackTop+squareSize);
  line(trackLeft+squareSize*2,trackTop,trackLeft+squareSize*2,trackTop+squareSize);
  drawingContext.save();
  drawingContext.shadowColor="rgba(190,255,170,.95)";
  drawingContext.shadowBlur=diameter*1.35;
  noStroke();
  fill(238,255,232);
  circle(x,y,diameter);
  drawingContext.restore();
}

function drawAnimatedLoadingBar(x,y,w,h,progress) {
  const context = drawingContext;
  const fillWidth = w * constrain(Number(progress) || 0,0,100) / 100;
  const stripeWidth = max(5,h*.18);
  const stripeStep = stripeWidth*2.5;
  const offset = (clock*h*.72)%stripeStep;

  noStroke(); fill(113,255,75); rect(x,y,fillWidth,h);
  context.save();
  context.beginPath(); context.rect(x,y,w,h); context.clip();
  drawLoadingStripes(context,x,y,w,h,stripeWidth,stripeStep,offset,"rgba(113,255,75,.16)");
  context.restore();

  if (fillWidth > 0) {
    context.save();
    context.beginPath(); context.rect(x,y,fillWidth,h); context.clip();
    drawLoadingStripes(context,x,y,fillWidth,h,stripeWidth,stripeStep,offset,"rgba(0,0,0,.32)");
    context.restore();
  }

  noFill(); stroke(113,255,75); strokeWeight(3); rect(x,y,w,h); noStroke();
}

function drawLoadingStripes(context,x,y,w,h,lineWidth,step,offset,color) {
  context.strokeStyle=color;
  context.lineWidth=lineWidth;
  for(let stripeX=x-h-step+offset;stripeX<x+w+h;stripeX+=step){
    context.beginPath();
    context.moveTo(stripeX,y+h+lineWidth);
    context.lineTo(stripeX+h+lineWidth,y-lineWidth);
    context.stroke();
  }
}

function drawSlideshow(cue) {
  const slides = activeCueData?.slides || words.map((text, index) => ({
    text,
    image: null,
    background: "#000000",
    foreground: index === words.length - 1 ? "#71ff4b" : "#f6edf0",
    zoom: index === words.length - 1
  }));
  const index = Math.max(0, Math.min(slides.length - 1, Math.trunc(Number(state.nuggetIndex) || 0)));
  const slide = slides[index];
  background(cue.background || "#000000");
  const imageRecord = slide.image ? slideImages.get(resolveSlideImage(slide.image, cue.data)) : null;
  if (imageRecord?.ready) {
    const zoom = slide.zoom ? 1 + ((clock * .8) % 4) : 1;
    const pop = nuggetPopTransition(performance.now() - nuggetPopStartedAt);
    drawingContext.save();
    drawingContext.globalAlpha = pop.opacity;
    drawingContext.translate(width / 2, height / 2);
    drawingContext.scale(zoom * pop.scale, zoom * pop.scale);
    drawingContext.translate(-width / 2, -height / 2);
    drawDomMediaFrame(drawingContext, imageRecord.image, width, height, slide.fit);
    drawingContext.restore();
  } else if (slide.text) {
    fill(cue.foreground || slide.foreground); textAlign(CENTER,CENTER); textStyle(BOLD);
    textSize(min(width*.06,72)); text(slide.text,width/2,height/2);
  }
}

function drawUnderwater() {
  const water = drawingContext.createLinearGradient(0,0,0,height);
  water.addColorStop(0,"#063250"); water.addColorStop(.48,"#031d35"); water.addColorStop(1,"#010711");
  drawingContext.fillStyle=water; drawingContext.fillRect(0,0,width,height);

  blendMode(ADD); noStroke();
  for(let i=0;i<7;i++){
    const drift=sin(clock*.09+i*1.7)*width*.035;
    fill(70,190,255,8+live.intensity*12);
    quad(width*(i/7)-width*.08+drift,0,width*(i/7)+width*.04+drift,0,width*(i/7)+width*.18,height,width*(i/7)-width*.03,height);
  }

  blendMode(BLEND);
  for(let i=0;i<44;i++){
    const diameter=4+(i%7)*3;
    const x=(noise(i*13.7)*width+sin(clock*.45+i)*18+width)%width;
    const y=height-((clock*(18+i%6*3)+i*83)%(height+100));
    noFill(); stroke(115,220,255,45+live.intensity*90); strokeWeight(max(1,diameter*.09)); ellipse(x,y,diameter);
    noStroke(); fill(220,250,255,80); ellipse(x-diameter*.18,y-diameter*.18,max(1,diameter*.14));
  }

  const seaweedColors=[[0,205,255],[255,35,115],[25,145,115]];
  noFill();
  for(let i=0;i<24;i++){
    const baseX=(i+.35)*width/24;
    const stalkHeight=height*(.16+(i%6)*.035);
    const sway=sin(clock*(.35+(i%4)*.04)+i)*width*.012;
    const [red,green,blue]=seaweedColors[i%seaweedColors.length];
    stroke(red,green,blue,130+live.intensity*90); strokeWeight(5+(i%4)*2);
    bezier(baseX,height+8,baseX-sway*.4,height-stalkHeight*.35,baseX+sway,height-stalkHeight*.72,baseX+sway*.55,height-stalkHeight);
    stroke(red,green,blue,50); strokeWeight(13+(i%3)*4);
    bezier(baseX,height+8,baseX-sway*.4,height-stalkHeight*.35,baseX+sway,height-stalkHeight*.72,baseX+sway*.55,height-stalkHeight);
  }
  noStroke(); fill(1,5,10,190); rect(0,height*.965,width,height*.035);
}

function drawSpreadsheet() {
  const transition=budgetChaosTransition(clock);
  const snapshot=transition.from, nextSnapshot=transition.to, phase=transition.phase;
  const columns=["ITEM","ACTUAL","% INCOME","STATUS"];
  const visibleRows=snapshot.rows.slice(0,6);
  const gutter=max(54,width*.045), top=max(132,height*.2), rows=visibleRows.length+3;
  const cw=(width-gutter)/columns.length, ch=(height-top)/rows;
  const green=color(113,255,75), white=color(245,250,247), muted=color(154,177,164);
  background(2,5,4);

  // App chrome and a formula bar make the projection read instantly as a live spreadsheet.
  noStroke(); fill(7,35,22); rect(0,0,width,top*.54);
  fill(green); rect(0,top*.51,width,max(3,height*.005));
  fill(white); textAlign(LEFT,CENTER); textStyle(BOLD); textSize(min(width*.052,76));
  text("PERSONAL_BUDGET_FINAL_v"+floor(lerp(snapshot.revision,nextSnapshot.revision,phase))+"_FINAL.xlsx",gutter*.45,top*.27);
  fill(9,14,12); rect(0,top*.54,width,top*.46);
  fill(5,9,7); stroke(green); strokeWeight(max(1,width*.001)); rect(gutter*.28,top*.62,gutter*.8,top*.28);
  noStroke(); fill(green); textStyle(BOLD); textAlign(CENTER,CENTER); textSize(min(width*.021,27)); text("fx",gutter*.68,top*.76);
  fill(white); textStyle(NORMAL); textAlign(LEFT,CENTER); textSize(min(width*.04,50));
  text(`=IF(A:A=\"LIFE\",#VALUE!,SUM(DEBT)+RAND()*PANIC)`,gutter*1.22,top*.76);

  // Column letters, row numbers and grid.
  fill(9,20,15); rect(0,top,gutter,height-top); rect(gutter,top,width-gutter,ch);
  stroke(39,70,53); strokeWeight(max(1,width*.0007));
  for(let x=0;x<=columns.length;x++) line(gutter+x*cw,top,gutter+x*cw,height);
  for(let y=0;y<=rows;y++) line(0,top+y*ch,width,top+y*ch);
  noStroke(); fill(green); textAlign(CENTER,CENTER); textSize(min(ch*.72,64)); textStyle(BOLD);
  columns.forEach((_,index)=>text(String.fromCharCode(65+index),gutter+(index+.5)*cw,top+ch*.5));
  fill(muted); for(let row=1;row<rows;row++) text(row,gutter*.5,top+(row+.5)*ch);

  const tableRow=1;
  fill(13,47,30); rect(gutter,top+tableRow*ch,width-gutter,ch);
  fill(green); textAlign(LEFT,CENTER); textSize(min(cw*.24,ch*.66,64));
  columns.forEach((label,index)=>text(label,gutter+index*cw+cw*.05,top+(tableRow+.5)*ch));

  visibleRows.forEach((row,index)=>{
    const nextRow=nextSnapshot.rows[index];
    const actual=lerp(row.actual,nextRow.actual,phase);
    const delta=lerp(row.delta,nextRow.delta,phase);
    const percent=lerp(row.percent,nextRow.percent,phase);
    const y=top+(index+2)*ch;
    noStroke(); fill(index%2?color(5,10,8):color(3,7,5)); rect(gutter,y,width-gutter,ch);
    const values=[formatBudgetUsd(actual),`${(percent*100).toFixed(1)}%`];
    if(row.status==="#VALUE!"||row.status==="DECLINED"){ fill(14,42,27); rect(gutter+3*cw,y,cw,ch); }
    values.push(row.status);
    drawBudgetItemLabel(row.item,gutter+cw*.05,y+ch*.5,cw,ch);
    values.forEach((value,column)=>{
      const tableColumn=column+1;
      fill(white);
      if(tableColumn===3&&row.status!=="PAID") fill(green);
      textAlign(RIGHT,CENTER); textStyle(NORMAL);
      const cellTextSize=min(cw*.24,ch*.66,64);
      textSize(cellTextSize);
      const measured=textWidth(value);
      if(measured>cw*.9) textSize(max(28,cellTextSize*cw*.9/measured));
      text(value,gutter+tableColumn*cw+cw*.95,y+ch*.5);
    });
  });

  stroke(39,70,53); strokeWeight(max(1,width*.0007));
  for(let x=0;x<=columns.length;x++) line(gutter+x*cw,top+ch,gutter+x*cw,top+(visibleRows.length+2)*ch);
  for(let y=1;y<=visibleRows.length+2;y++) line(gutter,top+y*ch,width,top+y*ch);

  const balance=lerp(snapshot.balance,nextSnapshot.balance,phase);
  const total=lerp(snapshot.total,nextSnapshot.total,phase);
  const income=lerp(snapshot.income,nextSnapshot.income,phase);
  const totalY=top+(visibleRows.length+2)*ch;
  noStroke(); fill(7,28,18); rect(gutter,totalY,width-gutter,ch);
  fill(green); rect(gutter,totalY,width-gutter,max(3,height*.004));
  fill(white); textSize(min(cw*.24,ch*.66,64)); textStyle(BOLD); textAlign(LEFT,CENTER); text("BALANCE",gutter+cw*.05,totalY+ch*.5);
  fill(green); textAlign(RIGHT,CENTER);
  text(formatBudgetUsd(balance),gutter+cw*2.95,totalY+ch*.5);
  fill(white); text(`${Math.round(total/income*100)}%`,gutter+cw*3.95,totalY+ch*.5);

  // Selection remains locked to an exact spreadsheet cell for the full two-second tick.
  const selectedColumn=[0,1,1,1,2,3][snapshot.selectedColumn] ?? 1;
  const selectedRow=snapshot.selectedRow%visibleRows.length;
  noFill(); stroke(green); strokeWeight(max(4,width*.003));
  rect(gutter+selectedColumn*cw,top+(selectedRow+2)*ch,cw,ch);
}

function drawBudgetItemLabel(value,x,y,cellWidth,cellHeight) {
  textAlign(LEFT,CENTER); textStyle(BOLD);
  const baseSize=min(cellWidth*.24,cellHeight*.66,64);
  textSize(baseSize);
  const measured=textWidth(value);
  if(measured>cellWidth*.9) textSize(max(28,baseSize*cellWidth*.9/measured));
  fill(245,250,247); text(value,x,y);
}

function drawAnatomy() {
  background(2); push(); translate(width/2,height/2); const s=min(width,height)*.35;
  noFill(); stroke(255,55,100); strokeWeight(9); ellipse(-s*.26,0,s*.6,s*.78); ellipse(s*.26,0,s*.6,s*.78); line(-s*.3,s*.22,s*.3,-s*.12);
  stroke(45,170,255); strokeWeight(3); ellipse(-s*.26+9,0,s*.6,s*.78); ellipse(s*.26-9,0,s*.6,s*.78); pop();
  noStroke(); fill(113,255,75); textAlign(LEFT,TOP); textSize(15); text("PELVIS / FRACTURE DETECTED\nSUBJECT: BEBE\nINTERNAL PROCESS: KALA",30,30);
}

function drawOrgans() {
  background(4); blendMode(ADD); noStroke();
  for(let i=0;i<12;i++) { const a=clock*.4+i, r=min(width,height)*(.06+i*.025); fill(255,30+i*8,95,45); ellipse(width/2+cos(a*.7)*r,height/2+sin(a)*r,r*1.5,r); }
  blendMode(BLEND); fill(113,255,75); textAlign(CENTER,CENTER); textSize(18); text("LOVE ORGAN / ACTIVE",width/2,height*.85);
}

function drawStoneComposite(cue) {
  background(0);
  if (media.readyState>=2 && media.currentSrc) drawDomMediaFrame(drawingContext,media,width,height,cue.fit || "cover");
  const dim = constrain(Number(cue.backgroundDim) || 0,0,1);
  if (dim>0) {
    drawingContext.save();
    drawingContext.fillStyle=`rgba(0,0,0,${dim})`;
    drawingContext.fillRect(0,0,width,height);
    drawingContext.restore();
  }
}

function drawMaskedStoneVideo(context, canvasWidth, canvasHeight, points) {
  const bounds=stoneMaskBounds(points);
  if (!bounds) return false;
  const target={ x:bounds.x*canvasWidth,y:bounds.y*canvasHeight,width:bounds.width*canvasWidth,height:bounds.height*canvasHeight };
  context.save();
  context.beginPath();
  context.moveTo(points[0][0]*canvasWidth,points[0][1]*canvasHeight);
  for(let index=1;index<points.length;index++) context.lineTo(points[index][0]*canvasWidth,points[index][1]*canvasHeight);
  context.closePath();
  context.clip();
  context.translate(target.x,target.y);
  if (auxMedia.readyState>=2 && auxMedia.currentSrc) drawDomMediaFrame(context,auxMedia,target.width,target.height,"cover");
  else {
    const gradient=context.createLinearGradient(0,0,target.width,target.height);
    gradient.addColorStop(0,"#ff3f78"); gradient.addColorStop(1,"#71ff4b");
    context.fillStyle=gradient; context.fillRect(0,0,target.width,target.height);
  }
  context.restore();
  return true;
}

function drawStoneTrace(context, canvasWidth, canvasHeight, points) {
  if(!points?.length) return;
  context.save();
  context.beginPath();
  context.moveTo(points[0][0]*canvasWidth,points[0][1]*canvasHeight);
  for(let index=1;index<points.length;index++) context.lineTo(points[index][0]*canvasWidth,points[index][1]*canvasHeight);
  context.fillStyle="transparent";
  context.strokeStyle="rgba(255,255,255,.8)";
  context.lineWidth=Math.max(3,Math.min(canvasWidth,canvasHeight)*.005);
  context.lineJoin="round";
  context.lineCap="round";
  context.stroke();
  context.restore();
}

function drawStoneOcclusion(context, canvasWidth, canvasHeight, points) {
  if(!stoneMaskBounds(points)) return false;
  context.save();
  context.beginPath();
  context.moveTo(points[0][0]*canvasWidth,points[0][1]*canvasHeight);
  for(let index=1;index<points.length;index++) context.lineTo(points[index][0]*canvasWidth,points[index][1]*canvasHeight);
  context.closePath();
  context.fillStyle="#000";
  context.fill();
  context.restore();
  return true;
}

function drawKalaFaceOverlay(context, canvasWidth, canvasHeight) {
  const settings=state.kalaFace || { x:.5,y:.5,scale:.42 };
  const position=kalaRemote.active ? kalaRemote : kalaPointer.active ? kalaPointer : { x:.5,y:.5 };
  const x=position.x*canvasWidth, y=position.y*canvasHeight;
  const boxSize=settings.scale*Math.min(canvasWidth,canvasHeight);
  const images=activeCueData?.images || [];
  const faceCycle=Math.floor(clock/3);
  if (state.pulse !== lastFacePulse || faceCycle !== lastFaceCycle || faceImageIndex < 0 || faceImageIndex >= images.length) {
    lastFacePulse=state.pulse;
    lastFaceCycle=faceCycle;
    faceImageIndex=images.length ? randomFaceIndex(images.length,faceImageIndex) : -1;
  }
  const record=faceImageIndex>=0 ? faceImages.get(resolveSlideImage(images[faceImageIndex],activeDataUrl)) : null;
  if (record?.ready) {
    context.save();
    context.translate(x-boxSize/2,y-boxSize/2);
    drawDomMediaFrame(context,record.image,boxSize,boxSize,"contain");
    context.restore();
    return;
  }
  context.save();
  context.translate(x,y);
  context.fillStyle="transparent";
  context.strokeStyle="#fff";
  context.lineWidth=Math.max(3,Math.min(canvasWidth,canvasHeight)*.007);
  context.beginPath(); context.ellipse(0,0,boxSize/2,boxSize/2,0,0,Math.PI*2); context.stroke();
  context.strokeStyle="#ff3f78";
  context.lineWidth=Math.max(2,Math.min(canvasWidth,canvasHeight)*.003);
  for(const [cx,cy,rx,ry] of [[-boxSize*.18,-boxSize*.08,boxSize*.1,boxSize*.04],[boxSize*.18,-boxSize*.08,boxSize*.1,boxSize*.04],[0,boxSize*.16,boxSize*.16,boxSize*.06]]) {
    context.beginPath(); context.ellipse(cx,cy,rx,ry,0,0,Math.PI); context.stroke();
  }
  context.restore();
}

function randomFaceIndex(length,previous) {
  if (length<=1) return 0;
  const candidate=Math.floor(Math.random()*length);
  return candidate===previous ? (candidate+1)%length : candidate;
}

function isHouseSetupPreview(cue) {
  return projectorOutput==="wall" && emergencyBlackoutOverride!==true && cue?.id==="house-loop" && state.setupPreview && state.setupPreview!=="off";
}

function drawSetupPreview() {
  if (state.setupPreview==="kala-face") background(0);
  else if (state.setupPreview==="stone-mask") {
    background(0);
  }
}

function drawCamera() {
  if (cameraReady && camera.readyState>=2) {
    drawDomMediaFrame(drawingContext,camera,width,height,"cover");
  }
}

function drawVideo(cue) {
  if (media.readyState<2 || !media.currentSrc) { background(0); return; }
  const level=mediaFadeLevel(media,cue.fadeOutDuration);
  media.volume=cue.audio===false ? 0 : level;
  drawingContext.save();
  drawingContext.globalAlpha*=level;
  drawDomMediaFrame(drawingContext,media,width,height,cue.fit || "cover");
  drawingContext.restore();
}

function mediaFadeLevel(element, fadeDuration) {
  const seconds=Number(fadeDuration);
  const duration=Number(element.duration);
  const currentTime=Number(element.currentTime);
  if (!(seconds>0) || !Number.isFinite(duration) || !Number.isFinite(currentTime)) return 1;
  const phase=Math.min(1,Math.max(0,(duration-currentTime)/seconds));
  return phase*phase*(3-2*phase);
}

function drawMediaWithFallback(cue, fallback) {
  if (media.readyState>=2 && media.currentSrc) drawDomMediaFrame(drawingContext, media, width, height, cue.fit || "cover");
  else fallback();
}

function drawDomMediaFrame(context, element, targetWidth, targetHeight, fit = "cover") {
  const sourceWidth = element.videoWidth || element.naturalWidth || element.width;
  const sourceHeight = element.videoHeight || element.naturalHeight || element.height;
  if (!sourceWidth || !sourceHeight) return false;
  if (fit === "portrait-right") {
    const cropWidth=Math.min(sourceWidth,sourceHeight*9/16);
    const cropX=(sourceWidth-cropWidth)/2;
    const scale=Math.min(targetWidth/cropWidth,targetHeight/sourceHeight);
    const drawWidth=cropWidth*scale,drawHeight=sourceHeight*scale;
    context.drawImage(element,cropX,0,cropWidth,sourceHeight,targetWidth-drawWidth,(targetHeight-drawHeight)/2,drawWidth,drawHeight);
    return true;
  }
  const scale = fit === "contain"
    ? Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight)
    : Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const drawWidth = sourceWidth * scale, drawHeight = sourceHeight * scale;
  context.drawImage(element, (targetWidth-drawWidth)/2, (targetHeight-drawHeight)/2, drawWidth, drawHeight);
  return true;
}

function drawCalibration() {
  const cell = Math.max(28, Math.min(width, height) / 12);
  noStroke();
  for (let y = 0, row = 0; y < height; y += cell, row++) {
    for (let x = 0, column = 0; x < width; x += cell, column++) {
      fill((row + column) % 2 ? 12 : 242);
      rect(x, y, Math.ceil(cell), Math.ceil(cell));
    }
  }
  noFill(); stroke(255,63,120); strokeWeight(Math.max(3, Math.min(width,height) * .006));
  rect(2,2,width-4,height-4);
  line(width/2,0,width/2,height); line(0,height/2,width,height/2);
  noStroke(); fill(255,63,120); textSize(Math.max(14,Math.min(width,height)*.026)); textStyle(BOLD);
  textAlign(LEFT,TOP); text(`${SURFACE_LABELS[activeSurfaceName()]} · ${width} × ${height}`,18,18);
}

function activeSurfaceName() {
  const cue = effectiveProjectorCue(cues[state.cueIndex] || cues[0]);
  return state.calibration ? projectorPlane : cueSurface(cue);
}

function applySurface() {
  const canvas = document.getElementById("projectorCanvas");
  const surface = activeSurfaceName();
  const quad = state.surfaces?.[surface];
  if (!canvas || !quad) return;
  try {
    canvas.style.transformOrigin = "0 0";
    canvas.style.transform = cssMatrix3dForQuad(window.innerWidth, window.innerHeight, quad);
    youtube.style.transform = canvas.style.transform;
    auxCanvas.style.transform="none";
  } catch {
    canvas.style.transform = "none";
    youtube.style.transform = "none";
    auxCanvas.style.transform = "none";
  }
}

function resizeAuxCanvas() {
  auxCanvas.width = Math.max(1, window.innerWidth);
  auxCanvas.height = Math.max(1, window.innerHeight);
}

function drawAuxiliary(cue) {
  const setupStoneVisible = isHouseSetupPreview(cue) && state.setupPreview === "stone-mask";
  const setupKalaVisible = isHouseSetupPreview(cue) && state.setupPreview === "kala-face";
  const kalaVisible = cue.projector === "kala-face" || setupKalaVisible;
  const stoneOcclusionVisible = cue.stoneOcclusion === true && cue.projector !== "stone-mask" && stoneMaskBounds(state.stoneMask);
  const visible = projectorOutput === "wall" && !isBlackoutActive() && !state.calibration && (cue.projector === "stone-mask" || setupStoneVisible || kalaVisible || stoneOcclusionVisible);
  auxCanvas.style.display = visible ? "block" : "none";
  if (!visible) return;
  if (cue.projector === "stone-mask" && media.ended && !auxMedia.paused) auxMedia.pause();
  const w = auxCanvas.width, h = auxCanvas.height;
  auxContext.clearRect(0, 0, w, h);
  if(kalaVisible) {
    drawKalaFaceOverlay(auxContext,w,h);
    return;
  }
  if(stoneOcclusionVisible) {
    drawStoneOcclusion(auxContext,w,h,state.stoneMask);
    return;
  }
  if(state.stoneMaskDraft?.length) drawStoneTrace(auxContext,w,h,state.stoneMaskDraft);
  else drawMaskedStoneVideo(auxContext,w,h,state.stoneMask);
}

function syncMedia(cue) {
  const cueChanged = activeCueId !== cue.id;
  activeCueId = cue.id;
  syncVideoElement(media, cue.media, {
    loop: cue.loop,
    muted: !outputArmed || cue.audio === false,
    reset: cueChanged && !cue.preservePlayback
  });
  syncVideoElement(auxMedia, cue.auxiliaryMedia, {
    loop: cue.auxiliaryLoop ?? cue.loop,
    muted: true,
    reset: cueChanged
  });
}

function syncVideoElement(element, source, { loop, muted, reset }) {
  if (!source) {
    if (!element.dataset.requested && !element.getAttribute("src")) return;
    element.pause();
    element.removeAttribute("src");
    element.dataset.requested = "";
    element.load();
    return;
  }
  const requested = new URL(source, location.href).href;
  const sourceChanged = element.dataset.requested !== requested;
  element.loop = Boolean(loop);
  element.muted = Boolean(muted);
  element.volume = 1;
  if (sourceChanged) {
    element.pause();
    element.dataset.requested = requested;
    element.src = requested;
    element.load();
  } else if (reset) {
    try { element.currentTime = 0; } catch {}
  }
  element.play().catch(() => {});
}

function syncYoutube(cue) {
  const videoId = cue.projector === "youtube" ? String(cue.youtubeId || "") : "";
  if (!videoId) {
    youtube.hidden = true;
    if (youtube.dataset.videoId) youtube.removeAttribute("src");
    youtube.dataset.videoId = "";
    return;
  }
  const wasHidden = youtube.hidden;
  const shouldHide = isBlackoutActive() || projectorOutput !== "wall" || Boolean(state.calibration);
  youtube.hidden = shouldHide;
  if (shouldHide) {
    if (!wasHidden) postYoutubeCommand("pauseVideo");
    return;
  }
  if (youtube.dataset.videoId === videoId) {
    if (wasHidden) postYoutubeCommand("playVideo");
    return;
  }
  youtube.dataset.videoId = videoId;
  const origin = encodeURIComponent(location.origin);
  youtube.src = `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?autoplay=1&controls=0&rel=0&playsinline=1&enablejsapi=1&origin=${origin}`;
}

function postYoutubeCommand(command) {
  youtube.contentWindow?.postMessage(JSON.stringify({ event:"command", func:command, args:[] }), "https://www.youtube.com");
}

function syncCueData(cue) {
  const requested = cue.data ? new URL(cue.data, location.href).href : null;
  if (requested === activeDataUrl) return;
  activeDataUrl = requested;
  activeCueData = null;
  if (!requested) return;
  loadCueData(requested, cue.projector).then((content) => {
    if (activeDataUrl !== requested) return;
    activeCueData = content;
    if (content.slides) preloadSlideImages(content.slides, requested);
    if (content.images) preloadFaceImages(content.images, requested);
  }).catch(() => {
    if (activeDataUrl === requested) activeCueData = null;
  });
}

function loadCueData(url, mode) {
  if (!dataCache.has(url)) {
    const pending = fetch(url, { cache:"no-store" }).then((response) => {
      if (!response.ok) throw new Error(`media data ${response.status}`);
      return response.json();
    }).then((candidate) => {
      if (mode === "slideshow") return normalizeSlideshowContent(candidate);
      if (mode === "kala-face") return normalizeFaceManifest(candidate);
      throw new Error(`unsupported projector data mode: ${mode}`);
    });
    dataCache.set(url, pending);
  }
  return dataCache.get(url);
}

function preloadFaceImages(images,dataUrl) {
  for(const imagePath of images) {
    const url=resolveSlideImage(imagePath,dataUrl);
    if(faceImages.has(url)) continue;
    const record={ image:new Image(),ready:false,failed:false };
    record.image.onload=()=>{ record.ready=true; };
    record.image.onerror=()=>{ record.failed=true; };
    record.image.src=url;
    faceImages.set(url,record);
  }
}

function preloadSlideImages(slides, dataUrl) {
  for (const slide of slides) {
    if (!slide.image) continue;
    const url = resolveSlideImage(slide.image, dataUrl);
    if (slideImages.has(url)) continue;
    const record = { image:new Image(), ready:false, failed:false };
    record.image.onload = () => { record.ready = true; };
    record.image.onerror = () => { record.failed = true; };
    record.image.src = url;
    slideImages.set(url, record);
  }
}

function resolveSlideImage(path, dataUrl) {
  return resolveMediaAssetUrl(path, dataUrl, location.href);
}

async function refreshMediaProbe() {
  if (mediaProbeRunning) return;
  mediaProbeRunning = true;
  mediaProbe = { status:"checking", checked:0, total:assetManifest.length, failed:0, checkedAt:Date.now(), failures:[] };
  client.refreshTelemetry();
  try {
    const results = await Promise.all(assetManifest.map(probeProductionAsset));
    const failures = results.filter((result) => !result.ready).map((result) => `${result.id}:${result.reason}`);
    mediaProbe = {
      status: failures.length ? "failed" : "ready",
      checked: results.length,
      total: assetManifest.length,
      failed: failures.length,
      checkedAt: Date.now(),
      failures
    };
  } catch {
    mediaProbe = { status:"failed", checked:0, total:assetManifest.length, failed:assetManifest.length, checkedAt:Date.now(), failures:["probe:INTERNAL_ERROR"] };
  } finally {
    mediaProbeRunning = false;
    client.refreshTelemetry();
  }
}

async function probeProductionAsset(asset) {
  try {
    if (asset.kind === "video" || asset.kind === "audio") await probeMediaMetadata(asset.path,asset.kind);
    else if (asset.kind === "json") {
      const response = await fetch(asset.path, { cache:"no-store" });
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      const normalized = validateMediaJson(asset.validator, await response.json());
      for (const slide of normalized.slides || []) {
        if (slide.image) await probeImageDecode(resolveSlideImage(slide.image, new URL(asset.path, location.href).href));
      }
      for (const imagePath of normalized.images || []) {
        await probeImageDecode(resolveSlideImage(imagePath,new URL(asset.path,location.href).href));
      }
    } else throw new Error("UNKNOWN_KIND");
    return { id:asset.id, ready:true, reason:"READY" };
  } catch (error) {
    return { id:asset.id, ready:false, reason:probeErrorCode(error) };
  }
}

function probeMediaMetadata(source,kind="video") {
  return new Promise((resolve, reject) => {
    const probe = document.createElement(kind === "audio" ? "audio" : "video");
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      probe.removeAttribute("src");
      probe.load();
      if (error) reject(error); else resolve();
    };
    const timer = setTimeout(() => finish(new Error("TIMEOUT")), 12000);
    probe.preload = "metadata";
    probe.muted = true;
    probe.addEventListener("loadedmetadata", () => {
      if (!probe.videoWidth || !probe.videoHeight) finish(new Error("NO_VIDEO_TRACK"));
      else finish();
    }, { once:true });
    probe.addEventListener("error", () => finish(new Error(`VIDEO_ERROR_${probe.error?.code || 0}`)), { once:true });
    probe.src = new URL(source, location.href).href;
    probe.load();
  });
}

function probeImageDecode(source) {
  return new Promise((resolve, reject) => {
    const probe = new Image();
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve();
    };
    const timer = setTimeout(() => finish(new Error("IMAGE_TIMEOUT")), 12000);
    probe.onload = () => probe.naturalWidth && probe.naturalHeight ? finish() : finish(new Error("EMPTY_IMAGE"));
    probe.onerror = () => finish(new Error("IMAGE_ERROR"));
    probe.src = source;
  });
}

function probeErrorCode(error) {
  const message = String(error?.message || "ERROR").toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  return message.slice(0, 28) || "ERROR";
}
