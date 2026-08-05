function sessionCameraPromptOpen() {
  return scene.session.cameraPrompt.open;
}

function openSessionCameraPrompt() {
  if (!data.loading.ready || sessionCameraPromptOpen()) return;

  let prompt = scene.session.cameraPrompt;
  if (!scene.text.hasSavedSession) clearTextMemory();
  resetSessionPhotoFrame();
  resetSessionBackgroundColor();
  resetSessionFaceDetection();
  scene.session.photo = null;
  scene.session.camera.nextTransition = 0;
  scene.session.camera.confirmTransition = 0;
  scene.session.mode = "camera";
  prompt.open = true;
  prompt.closing = false;
  prompt.confirming = false;
  prompt.transition = 0;
  prompt.transitionTarget = 1;
  prompt.nextMode = "idle";
  cancelSessionPhotoCountdown();
  startSessionCamera();
}

function closeSessionCameraPrompt(nextMode = "idle") {
  let prompt = scene.session.cameraPrompt;
  prompt.confirming = false;
  prompt.transitionTarget = 0;
  prompt.closing = true;
  prompt.nextMode = nextMode;
  cancelSessionPhotoCountdown();
  stopSessionCamera();
  scene.ui.pointer.pressTarget = null;
  scene.ui.pointer.pressStartedOnButton = false;
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
  let attempts = [
    {
      audio: false,
      video: {
        facingMode: { ideal: "user" },
        width: { ideal: 1280 },
        height: { ideal: 960 },
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
}

function sessionCameraLayout() {
  let scale = scene.ui.scale;
  let reviewing = scene.session.photo != null;
  let controlRows = reviewing ? 3 : 2;
  let padding = scene.ui.button.padding * scale;
  let controlHeight = scene.ui.button.height * scale;
  let controlRadius = scene.ui.button.radius * scale;
  let controlGap = 12 * scale;
  let titleWidth = min(width - padding * 2, 420 * scale);
  let previewWidth = min(width - padding * 2, 640 * scale);
  let availablePreviewHeight = max(
    120 * scale,
    height -
      padding * 4 -
      controlHeight * (controlRows + 1) -
      controlGap * controlRows,
  );
  let previewHeight = min(previewWidth * 0.75, availablePreviewHeight);
  let buttonWidth = min(width - padding * 2, 260 * scale);
  let cancelY = height / 2 - padding - controlHeight / 2;
  let retakeY = cancelY - controlHeight - controlGap;
  let nextY = retakeY - controlHeight - controlGap;
  let takeY = retakeY;
  let titleY = -height / 2 + padding + controlHeight / 2;
  let previewTop = titleY + controlHeight / 2 + padding;
  let previewBottom =
    (reviewing ? nextY : takeY) - controlHeight / 2 - padding;

  return {
    padding,
    controlGap,
    controlHeight,
    controlRadius,
    titleWidth,
    titleY,
    previewWidth,
    previewHeight,
    previewY: (previewTop + previewBottom) / 2,
    previewRadius: 28 * scale,
    buttonWidth,
    takeY,
    retakeY,
    nextY,
    cancelY,
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
    inout.audio.ui?.countdown(
      step,
      countdown.scale,
      mouseX / width,
    );
  }
}

function finishPlaySession() {
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
  textFont(scene.font);
  textAlign(CENTER, CENTER);
  textSize(22 * scene.ui.scale);
  text(message, 0, layout.previewY);
}

function drawSessionPhotoCountdown(previewY, layout, transition) {
  let countdown = scene.session.camera.countdown;
  if (!countdown.active) return;

  resetShader();
  noStroke();
  fill(255, 255 * transition);
  textFont(scene.font);
  textAlign(CENTER, CENTER);
  let countdownSize = min(width, height) * 0.25;
  textSize(countdownSize);
  let countdownX = (width + layout.previewWidth) / 4;
  let countdownY = previewY - countdownSize / 10;
  text(countdown.value, -countdownX, countdownY);
  text(countdown.value, countdownX, countdownY);
}

function drawCameraSessionFrontUi() {
  let prompt = scene.session.cameraPrompt;
  if (!prompt.open) return;

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
  let titleHiddenY = -height / 2 - layout.padding - layout.controlHeight / 2;
  let titleY = prompt.confirming
    ? lerp(layout.titleY, titleHiddenY, confirmTransition)
    : lerp(titleHiddenY, layout.titleY, transition);
  let buttonsOffset = (1 - transition) * (layout.controlHeight * 3);
  let previewRestY = lerp(
    height / 2 + layout.previewHeight / 2,
    layout.previewY,
    transition,
  );
  let previewExitY = height / 2 + layout.previewHeight / 2;
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
  fill(0, 255 * 0.5 * overlayTransition);
  rect(0, 0, width, height);
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

  scene.gui.cameraTitle.update(
    scene.elapsedTime,
    uiPointer(),
    uiPointerActive(),
  );
  scene.gui.cameraTitle.surface(
    0,
    titleY,
    layout.titleWidth,
    layout.controlHeight,
    layout.controlRadius,
  );
  resetShader();
  fill(255);
  textFont(scene.font);
  textAlign(CENTER, CENTER);
  textSize(layout.controlHeight / 1.5);
  text("Take a Picture", 0, titleY - layout.controlHeight / 10);

  noStroke();
  fill(255);
  let reviewing = scene.session.photo != null;
  let previewBottom = previewY + layout.previewHeight / 2;
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
    let nextHiddenY = previewBottom - layout.controlHeight / 2;
    let nextY = lerp(
      nextHiddenY,
      layout.nextY,
      scene.session.camera.nextTransition,
    );
    scene.gui.cameraNext.armed =
      scene.ui.pointer.pressTarget == "cameraNext";
    scene.gui.cameraNext.update(
      scene.elapsedTime,
      uiPointer(),
      uiPointerActive(),
    );
    scene.gui.cameraNext.button(
      0,
      nextY + buttonsOffset,
      layout.buttonWidth,
      layout.controlHeight,
      layout.controlRadius,
      1,
      ...scene.ui.actionColors.green,
    );
  } else {
    scene.gui.cameraNext.bounds = null;
  }

  scene.gui.cameraTake.label = reviewing ? "Retake" : "Take";
  if (reviewing && !controlIsSwept(layout.retakeY)) {
    scene.gui.cameraTake.armed =
      scene.ui.pointer.pressTarget == "cameraTake";
    scene.gui.cameraTake.update(
      scene.elapsedTime,
      uiPointer(),
      uiPointerActive(),
    );
    scene.gui.cameraTake.button(
      0,
      layout.retakeY + buttonsOffset,
      layout.buttonWidth,
      layout.controlHeight,
      layout.controlRadius,
      1,
      ...scene.ui.actionColors.red,
    );
  } else if (reviewing) {
    scene.gui.cameraTake.bounds = null;
  }

  if (reviewing && !controlIsSwept(layout.cancelY)) {
    scene.gui.cameraCancel.armed =
      scene.ui.pointer.pressTarget == "cameraCancel";
    scene.gui.cameraCancel.update(
      scene.elapsedTime,
      uiPointer(),
      uiPointerActive(),
    );
    scene.gui.cameraCancel.button(
      0,
      layout.cancelY + buttonsOffset,
      layout.buttonWidth,
      layout.controlHeight,
      layout.controlRadius,
    );
  } else if (reviewing) {
    scene.gui.cameraCancel.bounds = null;
  }

  if (!reviewing) {
    let controlsHiddenY = previewBottom - layout.controlHeight / 2;
    let takeY = lerp(controlsHiddenY, layout.takeY, transition);
    let cancelY = lerp(controlsHiddenY, layout.cancelY, transition);

    scene.gui.cameraTake.armed =
      scene.ui.pointer.pressTarget == "cameraTake";
    scene.gui.cameraTake.update(
      scene.elapsedTime,
      uiPointer(),
      uiPointerActive(),
    );
    scene.gui.cameraTake.button(
      0,
      takeY,
      layout.buttonWidth,
      layout.controlHeight,
      layout.controlRadius,
    );

    scene.gui.cameraCancel.armed =
      scene.ui.pointer.pressTarget == "cameraCancel";
    scene.gui.cameraCancel.update(
      scene.elapsedTime,
      uiPointer(),
      uiPointerActive(),
    );
    scene.gui.cameraCancel.button(
      0,
      cancelY,
      layout.buttonWidth,
      layout.controlHeight,
      layout.controlRadius,
    );
  }
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
  noFill();
  stroke(255, 180 * transition);
  strokeWeight(2 * scene.ui.scale);
  rect(
    0,
    previewY,
    layout.previewWidth,
    layout.previewHeight,
    layout.previewRadius,
  );
  drawCameraStatus({ ...layout, previewY }, transition);
  drawSessionPhotoCountdown(previewY, layout, transition);

  pop();

  if (finishConfirmation) {
    prompt.transition = 0;
    prompt.open = false;
    prompt.confirming = false;
    scene.session.mode = "frame";
    resetSessionPhotoFrame();
    scheduleSessionCacheSave();
    stopSessionCamera();
    data.loading.position.y = height;
    scene.ui.pointer.pressTarget = null;
    scene.ui.pointer.pressStartedOnButton = false;
  }
}
