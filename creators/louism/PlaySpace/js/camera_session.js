function sessionCameraPromptOpen() {
  return scene.session.cameraPrompt.open;
}

function chooseSessionCameraCaptureLabel() {
  let camera = scene.session.camera;
  let labels = camera.captureLabels.filter((label) => label != "");
  if (labels.length == 0) labels = ["Make Your Cover Shot!"];
  let candidates = labels.filter(
    (label) => label != camera.previousCaptureLabel,
  );
  if (candidates.length == 0) candidates = labels;
  camera.captureLabel = candidates[floor(random(candidates.length))];
  camera.previousCaptureLabel = camera.captureLabel;
  return camera.captureLabel;
}

function openSessionCameraPrompt() {
  if (!data.loading.ready || sessionCameraPromptOpen()) return;

  let prompt = scene.session.cameraPrompt;
  scene.session.generation++;
  closeBackgroundFramePicker();
  resetPrintPreviewState();
  if (!scene.text.hasSavedSession) clearTextMemory();
  resetSessionPhotoFrame();
  resetSessionBackgroundColor(true);
  resetSessionFaceDetection();
  scene.session.photo = null;
  scene.session.camera.nextTransition = 0;
  scene.session.camera.confirmTransition = 0;
  scene.session.mode = "camera";
  prompt.open = true;
  prompt.closing = false;
  prompt.confirming = false;
  prompt.exitConfirming = false;
  prompt.exitTransition = 0;
  prompt.transition = 0;
  prompt.transitionTarget = 1;
  prompt.nextMode = "idle";
  chooseSessionCameraCaptureLabel();
  cancelSessionPhotoCountdown();
  startSessionCamera();
}

function closeSessionCameraPrompt(nextMode = "idle") {
  let prompt = scene.session.cameraPrompt;
  prompt.confirming = false;
  prompt.exitConfirming = false;
  prompt.exitTransition = 0;
  prompt.transitionTarget = 0;
  prompt.closing = true;
  prompt.nextMode = nextMode;
  cancelSessionPhotoCountdown();
  stopSessionCamera();
  scene.ui.pointer.pressTarget = null;
  scene.ui.pointer.pressStartedOnButton = false;
}

function openSessionCameraExitConfirmation() {
  let prompt = scene.session.cameraPrompt;
  if (prompt.closing || prompt.confirming || prompt.exitConfirming) return;
  cancelSessionPhotoCountdown();
  prompt.exitConfirming = true;
  scene.ui.pointer.pressTarget = null;
  scene.ui.pointer.pressStartedOnButton = false;
}

function closeSessionCameraExitConfirmation() {
  scene.session.cameraPrompt.exitConfirming = false;
  scene.ui.pointer.pressTarget = null;
  scene.ui.pointer.pressStartedOnButton = false;
}

function confirmSessionCameraExit() {
  scene.session.cameraPrompt.exitConfirming = false;
  if (["frame", "active"].includes(scene.session.mode)) {
    finishPlaySession();
    return;
  }
  cancelSessionCameraPrompt();
}

function cancelSessionCameraPrompt() {
  resetSessionFaceDetection();
  scene.session.photo = null;
  discardSessionCache();
  closeSessionCameraPrompt("idle");
}

function acceptSessionPhoto() {
  if (scene.session.camera.status != "captured" || scene.session.photo == null) {
    return;
  }
  scene.session.cameraPrompt.confirming = true;
  scene.ui.pointer.pressTarget = null;
  scene.ui.pointer.pressStartedOnButton = false;
}

function retakeSessionPhoto() {
  if (scene.session.camera.status != "captured") return;
  resetSessionFaceDetection();
  scene.session.photo = null;
  discardSessionCache();
  scene.session.camera.status = "live";
  beginSessionPhotoCountdown();
}

async function startSessionCamera() {
  let camera = scene.session.camera;
  let requestId = ++camera.requestId;
  stopSessionCamera(false);
  camera.status = "requesting";
  camera.error = "";

  if (window.isSecureContext === false) {
    camera.status = "error";
    camera.error = "Camera needs HTTPS";
    return;
  }

  if (navigator.mediaDevices?.getUserMedia == null) {
    camera.status = "error";
    camera.error = sessionRunsAsInstalledApp()
      ? "Open in Safari for camera"
      : "Camera is unavailable in this browser";
    return;
  }

  try {
    let stream = await requestSessionCameraStream();
    if (requestId != camera.requestId || !sessionCameraPromptOpen()) {
      for (let track of stream.getTracks()) track.stop();
      return;
    }

    if (camera.video == null) {
      camera.video = document.createElement("video");
      camera.video.autoplay = true;
      camera.video.muted = true;
      camera.video.playsInline = true;
      camera.video.setAttribute("playsinline", "");
      camera.video.setAttribute("webkit-playsinline", "");
      camera.video.disablePictureInPicture = true;
    }
    camera.stream = stream;
    camera.video.srcObject = stream;
    await camera.video.play();
    camera.status = "live";
  } catch (error) {
    if (requestId != camera.requestId) return;
    stopSessionCamera(false);
    camera.status = "error";
    camera.error = sessionCameraErrorMessage(error);
    console.warn("Unable to start PlaySpace camera:", error);
  }
}

function sessionRunsAsInstalledApp() {
  return (
    navigator.standalone === true ||
    window.matchMedia?.("(display-mode: standalone)")?.matches === true
  );
}

async function requestSessionCameraStream() {
  let previewAspect = sessionCameraPreviewAspect();
  let preferredLandscape = previewAspect > 1;
  let attempts = [
    {
      audio: false,
      video: {
        facingMode: { ideal: "user" },
        width: { ideal: preferredLandscape ? 1280 : 1024 },
        height: { ideal: preferredLandscape ? 1024 : 1280 },
        aspectRatio: { ideal: previewAspect },
      },
    },
    { audio: false, video: true },
  ];
  let lastError = null;

  for (let constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      lastError = error;
      if (["NotAllowedError", "SecurityError"].includes(error?.name)) {
        throw error;
      }
    }
  }
  throw lastError || new Error("Camera request failed");
}

function sessionCameraPreviewAspect() {
  return width > height ? 5 / 4 : 4 / 5;
}

function sessionCameraErrorMessage(error) {
  if (window.isSecureContext === false || error?.name == "SecurityError") {
    return "Camera needs HTTPS";
  }
  if (error?.name == "NotAllowedError") {
    return "Allow Camera in Safari Settings";
  }
  if (["NotFoundError", "DevicesNotFoundError"].includes(error?.name)) {
    return "No camera was found";
  }
  if (
    sessionRunsAsInstalledApp() &&
    ["AbortError", "NotReadableError"].includes(error?.name)
  ) {
    return "Open in Safari for camera";
  }
  if (["AbortError", "NotReadableError"].includes(error?.name)) {
    return "Camera is busy—try again";
  }
  return "Camera could not start—try again";
}

function stopSessionCamera(cancelRequest = true) {
  let camera = scene.session.camera;
  if (cancelRequest) camera.requestId++;
  if (camera.stream != null) {
    for (let track of camera.stream.getTracks()) track.stop();
  }
  camera.stream = null;
  if (camera.video != null) camera.video.srcObject = null;
  if (["live", "requesting", "captured"].includes(camera.status)) {
    camera.status = "idle";
  }
  hideCameraFaceGuideOverlay();
}

function sessionCameraLayout() {
  let scale = scene.ui.scale;
  let padding = scene.ui.button.padding * scale;
  let controlHeight = scene.ui.button.height * scale;
  let controlRadius = scene.ui.button.radius * scale;
  let logoWidth = min(width * 0.3, 190 * scale);
  let logoAsset = scene.homeGallery.assets.logo;
  let logoHeight = logoAsset?.width > 1
    ? logoWidth * logoAsset.height / logoAsset.width
    : logoWidth * 0.65;
  let previewAspect = sessionCameraPreviewAspect();
  let previewWidth = min(
    width - padding * 2,
    height * 0.42 * previewAspect,
  );
  let previewHeight = previewWidth / previewAspect;
  let buttonWidth = min(260 * scale, previewWidth * 0.44);
  let actionX = previewWidth * 0.27;
  let exitWidth = min(width * 0.22, 120 * scale);
  let exitHeight = exitWidth * 171 / 242;

  return {
    padding,
    controlHeight,
    controlRadius,
    titleWidth: min(width - padding * 2, 560 * scale),
    titleY: -height * 0.245,
    logoWidth,
    logoHeight,
    logoY: -height * 0.36,
    exitX: -width / 2 + scene.ui.safeArea.left + padding + exitWidth / 2,
    exitY: uiSafeTopY(padding + exitHeight / 2),
    exitWidth,
    exitHeight,
    previewWidth,
    previewHeight,
    previewY: height * 0.02,
    previewRadius: 28 * scale,
    buttonWidth,
    actionX,
    takeY: height * 0.31,
    retakeY: height * 0.31,
    nextY: height * 0.31,
  };
}

function updateSessionCameraBuffer(w, h, radius) {
  let camera = scene.session.camera;
  let bufferWidth = max(1, round(w));
  let bufferHeight = max(1, round(h));
  if (camera.buffer == null) {
    camera.buffer = createGraphics(bufferWidth, bufferHeight);
    camera.buffer.pixelDensity(1);
  } else if (
    camera.buffer.width != bufferWidth ||
    camera.buffer.height != bufferHeight
  ) {
    camera.buffer.resizeCanvas(bufferWidth, bufferHeight);
  }

  let buffer = camera.buffer;
  if (
    scene.session.cameraPrompt.closing &&
    camera.status == "idle"
  ) {
    return buffer;
  }
  let context = buffer.drawingContext;
  context.clearRect(0, 0, bufferWidth, bufferHeight);
  context.save();
  context.beginPath();
  context.roundRect(0, 0, bufferWidth, bufferHeight, radius);
  context.clip();
  context.fillStyle = "rgb(24, 24, 24)";
  context.fillRect(0, 0, bufferWidth, bufferHeight);

  let video = camera.video;
  if (camera.status == "live" && video?.readyState >= 2) {
    let videoAspect = video.videoWidth / video.videoHeight;
    let frameAspect = bufferWidth / bufferHeight;
    let sourceWidth = video.videoWidth;
    let sourceHeight = video.videoHeight;
    let sourceX = 0;
    let sourceY = 0;
    if (videoAspect > frameAspect) {
      sourceWidth = video.videoHeight * frameAspect;
      sourceX = (video.videoWidth - sourceWidth) / 2;
    } else {
      sourceHeight = video.videoWidth / frameAspect;
      sourceY = (video.videoHeight - sourceHeight) / 2;
    }
    context.translate(bufferWidth, 0);
    context.scale(-1, 1);
    context.drawImage(
      video,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      bufferWidth,
      bufferHeight,
    );
  } else if (camera.status == "captured" && camera.captureBuffer != null) {
    let capture = camera.captureBuffer;
    let captureAspect = capture.width / capture.height;
    let frameAspect = bufferWidth / bufferHeight;
    let sourceWidth = capture.width;
    let sourceHeight = capture.height;
    let sourceX = 0;
    let sourceY = 0;
    if (captureAspect > frameAspect) {
      sourceWidth = capture.height * frameAspect;
      sourceX = (capture.width - sourceWidth) / 2;
    } else {
      sourceHeight = capture.width / frameAspect;
      sourceY = (capture.height - sourceHeight) / 2;
    }
    context.drawImage(
      capture.canvas,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      bufferWidth,
      bufferHeight,
    );
  }
  context.restore();
  return buffer;
}

function captureSessionPhoto() {
  let camera = scene.session.camera;
  let video = camera.video;
  if (camera.status != "live" || video?.readyState < 2) {
    startSessionCamera();
    return;
  }

  let maximumWidth = 1280;
  let captureWidth = min(video.videoWidth, maximumWidth);
  let captureHeight = round(captureWidth / (video.videoWidth / video.videoHeight));
  let capture = camera.captureBuffer;
  if (capture == null) {
    capture = createGraphics(captureWidth, captureHeight);
    capture.pixelDensity(1);
    camera.captureBuffer = capture;
  } else if (
    capture.width != captureWidth ||
    capture.height != captureHeight
  ) {
    capture.resizeCanvas(captureWidth, captureHeight);
  }
  capture.clear();
  let context = capture.drawingContext;
  context.save();
  context.translate(captureWidth, 0);
  context.scale(-1, 1);
  context.drawImage(video, 0, 0, captureWidth, captureHeight);
  context.restore();
  scene.session.photo = capture.get();
  scheduleSessionCacheSave(true);
  detectSessionPhotoFaces(scene.session.photo);
  camera.status = "captured";
  camera.flash = 1;
  if (inout.audio.cameraShutter?.isLoaded()) {
    if (inout.audio.cameraShutter.isPlaying()) {
      inout.audio.cameraShutter.stop();
    }
    inout.audio.cameraShutter.play();
  }
}

function beginSessionPhotoCountdown() {
  let camera = scene.session.camera;
  let countdown = camera.countdown;
  if (countdown.active) return;
  if (camera.status != "live" || camera.video?.readyState < 2) {
    startSessionCamera();
    return;
  }

  countdown.active = true;
  countdown.value = 3;
  countdown.startedAt = millis();
  countdown.lastStep = -1;
  let previousAngle = countdown.patternBaseAngle;
  let nextAngle = random(360);
  let angleDistance = abs(((nextAngle - previousAngle + 540) % 360) - 180);
  while (angleDistance < 90) {
    nextAngle = random(360);
    angleDistance = abs(((nextAngle - previousAngle + 540) % 360) - 180);
  }
  countdown.patternBaseAngle = nextAngle;
  updateSessionPhotoCountdown();
}

function cancelSessionPhotoCountdown() {
  let countdown = scene.session.camera.countdown;
  countdown.active = false;
  countdown.value = 3;
  countdown.lastStep = -1;
}

function updateSessionPhotoCountdown() {
  let countdown = scene.session.camera.countdown;
  if (!countdown.active) return;

  let elapsed = (millis() - countdown.startedAt) / 1000;
  if (elapsed >= 3) {
    countdown.active = false;
    captureSessionPhoto();
    return;
  }

  let step = constrain(floor(elapsed), 0, 2);
  countdown.value = 3 - step;
  if (step != countdown.lastStep) {
    countdown.lastStep = step;
    let angleOffsets = [0, 120, -120];
    countdown.patternAngle = countdown.patternBaseAngle + angleOffsets[step];
    countdown.patternPhaseX = random();
    countdown.patternPhaseY = random();
    inout.audio.ui?.countdown(
      step,
      countdown.scale,
      mouseX / width,
    );
  }
}

function finishPlaySession() {
  cancelSecretSessionLoad();
  scene.session.generation++;
  closeBackgroundFramePicker();
  resetPrintPreviewState();
  scene.ui.pointer.pressTarget = null;
  scene.ui.pointer.pressStartedOnButton = false;
  setTextEdit(false);
  clearTextMemory();
  discardSessionCache();
  resetSessionFaceDetection();
  scene.session.photo = null;
  resetSessionPhotoFrame();
  resetSessionBackgroundColor();
  scene.session.mode = "idle";
  data.loading.position.y = height;
}

function drawSessionPhoto(layerZ = 0) {
  drawClippedSessionPhoto(layerZ);
}

function drawCameraStatus(layout, transition) {
  let camera = scene.session.camera;
  if (["live", "captured"].includes(camera.status)) return;

  let message =
    camera.status == "requesting" ? "Starting camera..." : camera.error;
  if (message == "") return;
  resetShader();
  noStroke();
  fill(255, 220 * transition);
  textFont(scene.text.font);
  textAlign(CENTER, CENTER);
  textSize(22 * scene.ui.scale);
  text(message, 0, layout.previewY);
}

function updateCameraFaceGuideLuminance(preview) {
  let camera = scene.session.camera;
  if (camera.status != "live" || preview == null) return;

  let now = millis();
  if (now - camera.faceGuideLuminanceUpdatedAt < 220) return;
  camera.faceGuideLuminanceUpdatedAt = now;

  let analysisWidth = 24;
  let analysisHeight = 18;
  if (camera.faceGuideAnalysisBuffer == null) {
    camera.faceGuideAnalysisBuffer = createGraphics(
      analysisWidth,
      analysisHeight,
    );
    camera.faceGuideAnalysisBuffer.pixelDensity(1);
  }

  let analysis = camera.faceGuideAnalysisBuffer;
  let context = analysis.drawingContext;
  context.clearRect(0, 0, analysisWidth, analysisHeight);
  context.drawImage(
    preview.canvas,
    0,
    0,
    preview.width,
    preview.height,
    0,
    0,
    analysisWidth,
    analysisHeight,
  );
  analysis.loadPixels();

  let total = 0;
  let count = 0;
  for (let index = 0; index < analysis.pixels.length; index += 4) {
    if (analysis.pixels[index + 3] == 0) continue;
    total +=
      analysis.pixels[index] * 0.2126 +
      analysis.pixels[index + 1] * 0.7152 +
      analysis.pixels[index + 2] * 0.0722;
    count++;
  }
  if (count == 0) return;

  camera.faceGuideLuminance = total / (count * 255);
  if (camera.faceGuideLuminance >= 0.54) {
    camera.faceGuideDarkTarget = 1;
  } else if (camera.faceGuideLuminance <= 0.46) {
    camera.faceGuideDarkTarget = 0;
  }
}

function preloadCameraFaceGuideAssets() {
  let camera = scene.session.camera;
  let guides = [
    ["faceGuideDarkElement", camera.faceGuideDarkPath, "dark"],
    ["faceGuideLightElement", camera.faceGuideLightPath, "light"],
  ];
  data.amount += guides.length;

  for (let [property, path, label] of guides) {
    let element = document.createElement("img");
    element.alt = "";
    element.decoding = "async";
    element.draggable = false;
    element.addEventListener("load", loaded, { once: true });
    element.addEventListener(
      "error",
      (error) => {
        console.warn(`Unable to load ${label} camera face guide`, error);
        loaded();
      },
      { once: true },
    );
    element.src = path;
    camera[property] = element;
  }
}

function setupCameraFaceGuideOverlay() {
  let camera = scene.session.camera;
  let existing = document.getElementById("camera-face-guide");
  if (existing != null) existing.remove();

  let overlay = document.createElement("div");
  overlay.id = "camera-face-guide";
  overlay.className = "camera-face-guide";
  overlay.setAttribute("aria-hidden", "true");

  let lightGuide = camera.faceGuideLightElement;
  let darkGuide = camera.faceGuideDarkElement;
  if (lightGuide != null) {
    lightGuide.className = "camera-face-guide__image camera-face-guide__light";
    overlay.appendChild(lightGuide);
  }
  if (darkGuide != null) {
    darkGuide.className = "camera-face-guide__image camera-face-guide__dark";
    overlay.appendChild(darkGuide);
  }

  document.body.appendChild(overlay);
  camera.faceGuideOverlay = overlay;
  hideCameraFaceGuideOverlay();
}

function hideCameraFaceGuideOverlay() {
  let camera = scene?.session?.camera;
  let overlay = camera?.faceGuideOverlay;
  if (overlay == null) return;
  overlay.style.visibility = "hidden";
  overlay.style.opacity = "0";
}

function updateCameraFaceGuideOverlay(layout, previewY, transition, preview) {
  let prompt = scene.session.cameraPrompt;
  let camera = scene.session.camera;
  let overlay = camera.faceGuideOverlay;
  let darkGuide = camera.faceGuideDarkElement;
  let lightGuide = camera.faceGuideLightElement;
  if (
    camera.status == "captured" ||
    prompt.confirming ||
    prompt.exitConfirming ||
    overlay == null ||
    darkGuide == null ||
    lightGuide == null ||
    transition <= 0
  ) {
    hideCameraFaceGuideOverlay();
    return;
  }

  updateCameraFaceGuideLuminance(preview);
  camera.faceGuideDarkMix = animateData(
    camera.faceGuideDarkMix,
    camera.faceGuideDarkTarget,
    0.14,
  );

  let canvas = _renderer?.canvas;
  if (canvas == null || width <= 0 || height <= 0) {
    hideCameraFaceGuideOverlay();
    return;
  }

  let canvasBounds = canvas.getBoundingClientRect();
  let scaleX = canvasBounds.width / width;
  let scaleY = canvasBounds.height / height;
  let previewLeft = width / 2 - layout.previewWidth / 2;
  let previewTop = height / 2 + previewY - layout.previewHeight / 2;
  overlay.style.left = `${canvasBounds.left + previewLeft * scaleX}px`;
  overlay.style.top = `${canvasBounds.top + previewTop * scaleY}px`;
  overlay.style.width = `${layout.previewWidth * scaleX}px`;
  overlay.style.height = `${layout.previewHeight * scaleY}px`;
  overlay.style.borderRadius = `${layout.previewRadius * min(scaleX, scaleY)}px`;
  overlay.style.visibility = "visible";
  overlay.style.opacity = `${constrain(transition, 0, 1)}`;

  let guideOpacity = 220 / 255;
  lightGuide.style.opacity = `${guideOpacity * (1 - camera.faceGuideDarkMix)}`;
  darkGuide.style.opacity = `${guideOpacity * camera.faceGuideDarkMix}`;
}

function drawSessionPhotoCountdownPattern(target, transition) {
  let countdown = scene.session.camera.countdown;
  if (!countdown.active || target == null) return;

  target.push();
  target.resetShader();
  target.noStroke();

  let colors = [
    [224, 56, 52],
    [113, 204, 193],
    [239, 0, 123],
  ];
  let numberColor = colors[constrain(3 - countdown.value, 0, 2)];
  target.fill(...numberColor, 255 * transition);
  target.textFont(scene.text.font);
  target.textAlign(CENTER, CENTER);
  let numberSize = max(
    56 * scene.ui.scale,
    min(target.width, target.height) * 0.12,
  );
  let spacingX = numberSize * 1.55;
  let spacingY = numberSize * 1.35;
  target.textSize(numberSize);

  let stepProgress = ((millis() - countdown.startedAt) % 1000) / 1000;
  let travel = min(spacingX, spacingY) * 0.7 * stepProgress;
  let offsetX = countdown.patternPhaseX * spacingX +
    cos(countdown.patternAngle) * travel;
  let offsetY = countdown.patternPhaseY * spacingY +
    sin(countdown.patternAngle) * travel;
  let left = -target.width / 2 - spacingX * 2;
  let right = target.width / 2 + spacingX * 2;
  let top = -target.height / 2 - spacingY * 2;
  let bottom = target.height / 2 + spacingY * 2;
  let row = 0;

  for (let y = top + offsetY; y <= bottom; y += spacingY) {
    let stagger = row % 2 == 0 ? 0 : spacingX * 0.5;
    for (let x = left + offsetX + stagger; x <= right; x += spacingX) {
      target.text(countdown.value, x, y - numberSize * 0.08);
    }
    row += 1;
  }
  target.pop();
}

function drawCameraBrandLogo(layout, transition) {
  let logo = scene.homeGallery.assets.logo;
  if (logo == null || logo.width <= 1 || logo.height <= 1) return;
  push();
  resetShader();
  imageMode(CENTER);
  tint(255, 255 * transition);
  image(
    logo,
    0,
    layout.logoY,
    layout.logoWidth,
    layout.logoHeight,
  );
  noTint();
  pop();
}

function drawCameraExitChoice(gui, label, y, popupWidth, light = false) {
  let choiceWidth = popupWidth * 0.36;
  let choiceHeight = 62 * scene.ui.scale;
  let pressed = gui.armed === true;
  gui.bounds = { x: 0, y, w: choiceWidth, h: choiceHeight };
  push();
  resetShader();
  translate(0, y + (pressed ? 4 * scene.ui.scale : 0));
  scale(pressed ? 0.96 : 1);
  rectMode(CENTER);
  noFill();
  stroke(light ? 255 : 25);
  strokeWeight(2 * scene.ui.scale);
  rect(0, 0, choiceWidth, choiceHeight);
  noStroke();
  fill(light ? 255 : 25);
  textFont(scene.text.font);
  textAlign(CENTER, CENTER);
  textSize(choiceHeight * 0.44);
  text(label, 0, -choiceHeight * 0.04);
  pop();
}

function drawCameraExitConfirmation(prompt) {
  prompt.exitTransition = animateData(
    prompt.exitTransition,
    prompt.exitConfirming ? 1 : 0,
    0.18,
  );
  let popupTransition = prompt.exitTransition;
  if (popupTransition < 0.01) {
    scene.gui.cameraExitCancel.bounds = null;
    scene.gui.cameraExitYes.bounds = null;
    return;
  }

  let gl = _renderer.GL;
  let depthTestEnabled = gl.isEnabled(gl.DEPTH_TEST);
  let depthWriteEnabled = gl.getParameter(gl.DEPTH_WRITEMASK);
  gl.disable(gl.DEPTH_TEST);
  gl.depthMask(false);
  try {
    resetShader();
    rectMode(CENTER);
    noStroke();
    fill(0, 150 * popupTransition);
    rect(0, 0, width, height);

    let popupAsset = scene.flowUi.slices.popup;
    let popupWidth = min(width * 0.78, 560 * scene.ui.scale);
    let popupHeight = min(height * 0.72, popupWidth * 1560 / 1808);
    if (popupAsset?.width > 1) {
      imageMode(CENTER);
      tint(255, 255 * popupTransition);
      image(popupAsset, 0, 0, popupWidth, popupHeight);
      noTint();
    }

    resetShader();
    fill(25, 25, 25, 255 * popupTransition);
    textAlign(CENTER, CENTER);
    textFont(scene.font);
    textSize(popupWidth * 0.12);
    text("Back", 0, -popupHeight * 0.25);
    textSize(popupWidth * 0.1);
    let phraseY = -popupHeight * 0.09;
    let toWidth = textWidth("to ");
    textFont(scene.text.font);
    let homeWidth = textWidth("Home?");
    let phraseLeft = -(toWidth + homeWidth) / 2;
    textFont(scene.font);
    textAlign(LEFT, CENTER);
    text("to ", phraseLeft, phraseY);
    textFont(scene.text.font);
    text("Home?", phraseLeft + toWidth, phraseY);

    scene.gui.cameraExitCancel.armed =
      scene.ui.pointer.pressTarget == "cameraExitCancel";
    drawCameraExitChoice(
      scene.gui.cameraExitCancel,
      "Cancel",
      popupHeight * 0.15,
      popupWidth,
    );
    scene.gui.cameraExitYes.armed =
      scene.ui.pointer.pressTarget == "cameraExitYes";
    drawCameraExitChoice(
      scene.gui.cameraExitYes,
      "Yes",
      popupHeight * 0.31,
      popupWidth,
      true,
    );
  } finally {
    gl.depthMask(depthWriteEnabled);
    if (depthTestEnabled) gl.enable(gl.DEPTH_TEST);
  }
}

function drawCameraSessionFrontUi() {
  let prompt = scene.session.cameraPrompt;
  if (!prompt.open) {
    hideCameraFaceGuideOverlay();
    return;
  }

  prompt.transition = animateData(
    prompt.transition,
    prompt.transitionTarget,
    0.16,
  );
  if (prompt.closing && prompt.transition < 0.01) {
    prompt.transition = 0;
    prompt.open = false;
    prompt.closing = false;
    scene.session.mode = prompt.nextMode;
    if (scene.session.mode == "active") data.loading.position.y = height;
    hideCameraFaceGuideOverlay();
    return;
  }

  updateSessionPhotoCountdown();

  let layout = sessionCameraLayout();
  let transition = prompt.transition;
  scene.session.camera.confirmTransition = animateData(
    scene.session.camera.confirmTransition,
    prompt.confirming ? 1 : 0,
    0.12,
  );
  let confirmTransition = scene.session.camera.confirmTransition;
  let titleHiddenY = uiHiddenTopY(layout.controlHeight, layout.padding);
  let titleY = prompt.confirming
    ? lerp(layout.titleY, titleHiddenY, confirmTransition)
    : lerp(titleHiddenY, layout.titleY, transition);
  let buttonsHiddenY = uiHiddenBottomY(
    layout.controlHeight,
    layout.padding,
  );
  let cameraControlY = (visibleY) => lerp(
    buttonsHiddenY,
    visibleY,
    transition,
  );
  let previewRestY = lerp(
    uiHiddenBottomY(layout.previewHeight / 2, layout.padding),
    layout.previewY,
    transition,
  );
  let previewExitY = uiHiddenBottomY(
    layout.previewHeight / 2,
    layout.padding,
  );
  let previewY = prompt.confirming
    ? lerp(layout.previewY, previewExitY, confirmTransition)
    : previewRestY;

  push();
  resetMatrix();
  ortho(-width / 2, width / 2, -height / 2, height / 2, -min(width, height));
  resetShader();
  _renderer.GL.clear(_renderer.GL.DEPTH_BUFFER_BIT);
  translate(0, 0, 128);
  rectMode(CENTER);
  noStroke();
  let overlayTransition = prompt.confirming
    ? transition * (1 - confirmTransition)
    : transition;
  if (!scene.session.camera.countdown.active) {
    fill(255, 235, 221, 255 * overlayTransition);
    rect(0, 0, width, height);
  }
  _renderer.GL.clear(_renderer.GL.DEPTH_BUFFER_BIT);

  let flashOpacity = scene.session.camera.flash;
  if (flashOpacity > 0) {
    fill(255, 255 * flashOpacity * flashOpacity);
    rect(0, 0, width, height);
    scene.session.camera.flash = max(
      0,
      flashOpacity - deltaTime / 140,
    );
  }

  drawCameraBrandLogo(layout, overlayTransition);
  if (!prompt.confirming) {
    scene.gui.cameraExit.armed =
      scene.ui.pointer.pressTarget == "cameraExit";
    drawFlowSliceButton(
      scene.gui.cameraExit,
      "exitDark",
      layout.exitX,
      layout.exitY,
      layout.exitWidth,
      layout.exitHeight,
    );
  } else {
    scene.gui.cameraExit.bounds = null;
  }

  resetShader();
  fill(79, 15, 47);
  textFont(scene.font);
  textAlign(CENTER, CENTER);
  let reviewing = scene.session.photo != null;
  let captureLabel = reviewing
    ? "Here’s your photo"
    : scene.session.camera.captureLabel;
  let captureLabelSize = layout.controlHeight * 0.72;
  let captureLabelWidth = layout.titleWidth - layout.controlHeight * 0.5;
  textSize(captureLabelSize);
  if (textWidth(captureLabel) > captureLabelWidth) {
    captureLabelSize *= captureLabelWidth / textWidth(captureLabel);
    textSize(captureLabelSize);
  }
  text(captureLabel, 0, titleY - layout.controlHeight / 10);

  noStroke();
  fill(255);
  let previewBottom = previewY + layout.previewHeight / 2;
  let behindPreviewY = previewBottom - layout.controlHeight * 0.82;
  let controlIsSwept = (controlY) =>
    prompt.confirming &&
    previewBottom >= controlY + layout.controlHeight / 2;
  let finishConfirmation =
    prompt.confirming && confirmTransition > 0.99;

  let nextTarget =
    scene.session.camera.status == "captured" && !prompt.closing ? 1 : 0;
  scene.session.camera.nextTransition = animateData(
    scene.session.camera.nextTransition,
    nextTarget,
    0.16,
  );
  let nextVisible =
    nextTarget > 0 || scene.session.camera.nextTransition > 0.01;
  if (nextVisible && !controlIsSwept(layout.nextY)) {
    let nextY = lerp(
      behindPreviewY,
      layout.nextY,
      scene.session.camera.nextTransition,
    );
    scene.gui.cameraNext.armed =
      scene.ui.pointer.pressTarget == "cameraNext";
    drawFlowSliceButton(
      scene.gui.cameraNext,
      "next",
      layout.actionX,
      cameraControlY(nextY),
      layout.buttonWidth,
      layout.controlHeight * 1.25,
    );
  } else {
    scene.gui.cameraNext.bounds = null;
  }

  scene.gui.cameraTake.label = reviewing ? "Retake" : "Take";
  if (reviewing && !controlIsSwept(layout.retakeY)) {
    scene.gui.cameraTake.armed =
      scene.ui.pointer.pressTarget == "cameraTake";
    drawFlowSliceButton(
      scene.gui.cameraTake,
      "retake",
      -layout.actionX,
      cameraControlY(layout.retakeY),
      layout.buttonWidth,
      layout.controlHeight * 1.25,
    );
  } else if (reviewing) {
    scene.gui.cameraTake.bounds = null;
  }

  if (!reviewing) {
    let takeY = lerp(behindPreviewY, layout.takeY, transition);

    scene.gui.cameraTake.armed =
      scene.ui.pointer.pressTarget == "cameraTake";
    drawFlowSliceButton(
      scene.gui.cameraTake,
      "capture",
      0,
      takeY,
      layout.buttonWidth * 1.35,
      layout.controlHeight * 1.25,
    );
  }
  scene.gui.cameraCancel.bounds = null;
  _renderer.GL.clear(_renderer.GL.DEPTH_BUFFER_BIT);

  let preview = updateSessionCameraBuffer(
    layout.previewWidth,
    layout.previewHeight,
    layout.previewRadius,
  );
  imageMode(CENTER);
  image(
    preview,
    0,
    previewY,
    layout.previewWidth,
    layout.previewHeight,
  );
  updateCameraFaceGuideOverlay(layout, previewY, transition, preview);
  noFill();
  stroke(79, 15, 47, 180 * transition);
  strokeWeight(2 * scene.ui.scale);
  rect(
    0,
    previewY,
    layout.previewWidth,
    layout.previewHeight,
    layout.previewRadius,
  );
  drawCameraStatus({ ...layout, previewY }, transition);
  drawCameraExitConfirmation(prompt);

  pop();

  if (finishConfirmation) {
    prompt.transition = 0;
    prompt.open = false;
    prompt.confirming = false;
    scene.session.mode = "frame";
    resetSessionPhotoFrame();
    startSessionPhotoFrameStage();
    scheduleSessionCacheSave();
    stopSessionCamera();
    data.loading.position.y = height;
    scene.ui.pointer.pressTarget = null;
    scene.ui.pointer.pressStartedOnButton = false;
  }
}
