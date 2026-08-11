function requestPrintPreview() {
  scene.ui.printPreview.pending = true;
}

function cardPreviewSnapshot(image, fullResolution = false) {
  let bounds = compositionBounds();
  let scaleX = image.width / width;
  let scaleY = image.height / height;
  let snapshot = image.get(
    round(bounds.x * scaleX),
    round(bounds.y * scaleY),
    max(1, round(bounds.width * scaleX)),
    max(1, round(bounds.height * scaleY)),
  );
  if (fullResolution) {
    snapshot.resize(scene.composition.width, scene.composition.height);
    return snapshot;
  }

  let maximumDimension = 768;
  let largestDimension = max(snapshot.width, snapshot.height);
  if (largestDimension > maximumDimension) {
    let scale = maximumDimension / largestDimension;
    snapshot.resize(
      max(1, round(snapshot.width * scale)),
      max(1, round(snapshot.height * scale)),
    );
  }
  return snapshot;
}

function setupCardPreviewCaptureBuffer() {
  let buffer = createGraphics(width, height, WEBGL);
  buffer.pixelDensity(1);
  buffer.smooth();
  buffer.angleMode(DEGREES);
  buffer.textFont(scene.text.font);
  buffer.textAlign(CENTER, CENTER);
  buffer.ortho();
  return buffer;
}

function clearCardPreviewCaptureBuffer(buffer) {
  buffer.clear();
  buffer.resetMatrix();
  buffer.ortho();
  buffer._renderer.GL.clear(
    buffer._renderer.GL.COLOR_BUFFER_BIT |
      buffer._renderer.GL.DEPTH_BUFFER_BIT,
  );
}

function captureCardPreviewLayers(liveBaseSnapshot) {
  let state = scene.ui.printPreview;
  let originalWorkspace = scene.workspace;
  let captureBuffer = setupCardPreviewCaptureBuffer();
  let baseSnapshot = null;
  let layers = [];

  try {
    scene.workspace = captureBuffer;
    clearCardPreviewCaptureBuffer(captureBuffer);
    captureBuffer.push();
    captureBuffer.resetMatrix();
    captureBuffer.imageMode(CENTER);
    let bounds = compositionBounds();
    captureBuffer.image(
      liveBaseSnapshot,
      0,
      0,
      bounds.width,
      bounds.height,
    );
    captureBuffer.pop();
    baseSnapshot = cardPreviewSnapshot(captureBuffer, true);

    let baseTextSize = min(width, height) / 4;
    let order = syncLayerOrder();
    for (let key of order) {
      let item = layerItemForKey(key);
      if (item == null) continue;
      clearCardPreviewCaptureBuffer(captureBuffer);
      if (item.type == "photo") {
        drawSessionPhoto(0);
      } else {
        let path = textPathForWordIndex(item.wordIndex);
        if (path == null) continue;
        drawWordOnTextPath(
          textWords()[item.wordIndex],
          path,
          textSizeForWordIndex(item.wordIndex, baseTextSize),
          item.wordIndex,
          0,
        );
      }
      layers.push({
        key,
        type: item.type,
        snapshot: cardPreviewSnapshot(captureBuffer),
      });
    }

    clearCardPreviewCaptureBuffer(captureBuffer);
    drawFrameOverlay(captureBuffer, 0);
    layers.push({
      key: "frame-overlay",
      type: "overlay",
      snapshot: cardPreviewSnapshot(captureBuffer),
    });
  } finally {
    scene.workspace = originalWorkspace;
    captureBuffer.remove();
  }

  state.snapshot = baseSnapshot;
  state.layers = layers;
}

function capturePrintPreview(liveBaseSnapshot) {
  let state = scene.ui.printPreview;
  if (!state.pending) return;

  captureCardPreviewLayers(liveBaseSnapshot);
  state.pending = false;
  state.open = true;
  state.transition = 0;
  state.transitionTarget = 1;
  state.closing = false;
  state.completeSession = false;
  state.introSpin.active = true;
  state.introSpin.startedAt = millis();
  state.rotation.x = 0;
  state.rotation.y = 0;
  state.velocity.x = 0;
  state.velocity.y = 0;
  state.snap.active = false;
}

function closePrintPreview(completeSession = false) {
  let state = scene.ui.printPreview;
  state.transitionTarget = 0;
  state.closing = true;
  state.introSpin.active = false;
  state.completeSession = state.completeSession || completeSession;
  state.drag.active = false;
  state.snap.active = false;
  scene.ui.pointer.pressTarget = null;
  scene.ui.pointer.pressStartedOnButton = false;
}

function beginPrintPreviewDrag() {
  let state = scene.ui.printPreview;
  state.introSpin.active = false;
  state.snap.active = false;
  state.drag.active = true;
  state.drag.moved = false;
  state.drag.lastX = mouseX;
  state.drag.lastY = mouseY;
  state.drag.lastTime = millis();
  state.velocity.x = 0;
  state.velocity.y = 0;
}

function updatePrintPreviewDrag() {
  let state = scene.ui.printPreview;
  if (!state.drag.active) return;

  let deltaX = mouseX - state.drag.lastX;
  let deltaY = mouseY - state.drag.lastY;
  let now = millis();
  let elapsed = max(1, now - state.drag.lastTime) / 1000;
  let rotationScale = 0.32 / max(0.75, scene.ui.scale);

  if (abs(deltaX) + abs(deltaY) > 1) {
    state.drag.moved = true;
    state.rotation.y += deltaX * rotationScale;
    state.rotation.x -= deltaY * rotationScale;
    state.velocity.y = lerp(
      state.velocity.y,
      constrain((deltaX * rotationScale) / elapsed, -720, 720),
      0.65,
    );
    state.velocity.x = lerp(
      state.velocity.x,
      constrain((-deltaY * rotationScale) / elapsed, -720, 720),
      0.65,
    );
    state.drag.lastX = mouseX;
    state.drag.lastY = mouseY;
    state.drag.lastTime = now;
  }
}

function endPrintPreviewDrag() {
  let state = scene.ui.printPreview;
  if (!state.drag.active) return;

  updatePrintPreviewDrag();
  state.drag.active = false;
  if (!state.drag.moved) closePrintPreview();
}

function updatePrintPreviewInertia() {
  let state = scene.ui.printPreview;
  if (state.drag.active) return;

  if (state.introSpin.active) {
    let progress = constrain(
      (millis() - state.introSpin.startedAt) /
        (state.introSpin.duration * 1000),
      0,
      1,
    );
    let eased =
      progress * progress * progress *
      (progress * (progress * 6 - 15) + 10);
    state.rotation.x = -8 * sin(progress * 180);
    state.rotation.y = eased * 360;
    state.velocity.x = 0;
    state.velocity.y = 0;
    if (progress >= 1) {
      state.introSpin.active = false;
      state.rotation.x = 0;
      state.rotation.y = 360;
      state.snap.active = false;
    }
    return;
  }

  let elapsed = min(deltaTime / 1000, 0.05);
  if (state.snap.active) {
    let smooth = 1 - pow(1 - state.snap.smooth, elapsed * 60);
    state.rotation.x = lerp(
      state.rotation.x,
      state.snap.targetX,
      smooth,
    );
    state.rotation.y = lerp(
      state.rotation.y,
      state.snap.targetY,
      smooth,
    );

    if (
      abs(state.rotation.x - state.snap.targetX) < 0.1 &&
      abs(state.rotation.y - state.snap.targetY) < 0.1
    ) {
      let backFacing = abs(round(state.snap.targetY / 180)) % 2 == 1;
      state.rotation.x = 0;
      state.rotation.y = backFacing ? 180 : 0;
      state.snap.active = false;
    }
    return;
  }

  state.rotation.x += state.velocity.x * elapsed;
  state.rotation.y += state.velocity.y * elapsed;
  let damping = pow(0.985, elapsed * 60);
  state.velocity.x *= damping;
  state.velocity.y *= damping;

  if (abs(state.velocity.x) < 0.01) state.velocity.x = 0;
  if (abs(state.velocity.y) < 0.01) state.velocity.y = 0;

  if (
    Math.hypot(state.velocity.x, state.velocity.y) <
    state.snap.velocityThreshold
  ) {
    state.velocity.x = 0;
    state.velocity.y = 0;
    state.snap.targetX = round(state.rotation.x / 360) * 360;
    state.snap.targetY = round(state.rotation.y / 180) * 180;
    state.snap.active = true;
  }
}

function drawCardPreviewStickerShadow(
  snapshot,
  widthValue,
  heightValue,
  shadowDepth,
) {
  push();
  translate(2, 3, shadowDepth);
  noStroke();
  tint(0, 55);
  textureMode(NORMAL);
  texture(snapshot);
  plane(widthValue, heightValue);
  noTint();
  pop();
}

function drawCardPreviewSticker(snapshot, widthValue, heightValue, depth) {
  push();
  translate(0, 0, depth);
  noStroke();
  textureMode(NORMAL);
  texture(snapshot);
  plane(widthValue, heightValue);
  pop();
}

function drawPrintPreviewPlane(
  snapshot,
  layers,
  paperWidth,
  paperHeight,
  contentWidth,
  contentHeight,
  planeY,
) {
  let state = scene.ui.printPreview;
  let frontFacing =
    cos(state.rotation.x) * cos(state.rotation.y) >= 0;
  let paperRadius = min(paperWidth, paperHeight) *
    scene.composition.cornerRadius;
  let contentInset = max(
    (paperWidth - contentWidth) / 2,
    (paperHeight - contentHeight) / 2,
  );
  let contentRadius = max(0, paperRadius - contentInset);

  push();
  translate(0, planeY, 0);
  rotateX(state.rotation.x);
  rotateY(state.rotation.y);
  noStroke();

  if (frontFacing) {
    let cardSurfaceDepth = 0.75;
    fill(255);
    rectMode(CENTER);
    rect(0, 0, paperWidth, paperHeight, paperRadius);
    translate(0, 0, cardSurfaceDepth);
    textureMode(NORMAL);
    texture(snapshot);
    rect(0, 0, contentWidth, contentHeight, contentRadius);
    let layerGap = state.depthTotal / max(1, layers.length);
    _renderer.GL.depthMask(false);
    for (let index = 0; index < layers.length; index++) {
      if (layers[index].type == "overlay") continue;
      drawCardPreviewStickerShadow(
        layers[index].snapshot,
        contentWidth,
        contentHeight,
        0.01,
      );
    }
    _renderer.GL.depthMask(true);
    for (let index = 0; index < layers.length; index++) {
      drawCardPreviewSticker(
        layers[index].snapshot,
        contentWidth,
        contentHeight,
        1.5 + layerGap * (index + 1),
      );
    }
  } else {
    fill(200);
    rectMode(CENTER);
    rect(0, 0, paperWidth, paperHeight, paperRadius);
    push();
    translate(0, 0, -0.75);
    rotateY(180);
    resetShader();
    textFont(scene.text.font);
    textAlign(CENTER, CENTER);
    let watermarkSize = paperHeight * 0.1;
    textSize(watermarkSize);
    if (textWidth("PlaySpace") > paperWidth * 0.76) {
      watermarkSize *=
        (paperWidth * 0.76) / textWidth("PlaySpace");
      textSize(watermarkSize);
    }
    fill(70, 150);
    text("PlaySpace", 0, -watermarkSize / 10);
    pop();
  }
  pop();
}

function printPreviewPaperSize(snapshotAspect) {
  let maximumWidth = width * 0.25;
  let maximumHeight = height * 0.25;
  let paperWidth;
  let paperHeight;
  let contentWidth;
  let contentHeight;

  if (snapshotAspect >= 1) {
    paperHeight = 1;
    contentHeight = 0.96;
    contentWidth = contentHeight * snapshotAspect;
    paperWidth = contentWidth + 0.04;
  } else {
    paperWidth = 1;
    contentWidth = 0.96;
    contentHeight = contentWidth / snapshotAspect;
    paperHeight = contentHeight + 0.04;
  }

  let fitScale = min(
    maximumWidth / paperWidth,
    maximumHeight / paperHeight,
  );
  return {
    width: paperWidth * fitScale,
    height: paperHeight * fitScale,
    contentWidth: contentWidth * fitScale,
    contentHeight: contentHeight * fitScale,
  };
}

function drawPrintPreview() {
  let state = scene.ui.printPreview;
  if (!state.open || state.snapshot == null) return;

  state.transition = animateData(
    state.transition,
    state.transitionTarget,
    0.16,
  );
  if (state.closing && state.transition < 0.01) {
    let completeSession = state.completeSession;
    state.transition = 0;
    state.open = false;
    state.closing = false;
    state.completeSession = false;
    state.snapshot = null;
    state.layers = [];
    if (completeSession) {
      finishPlaySession();
    } else {
      scene.session.mode = "active";
      setTextEdit(true);
      saveTextMemory();
    }
    return;
  }

  updatePrintPreviewInertia();

  let scale = scene.ui.scale;
  let padding = scene.ui.button.padding * scale;
  let titleHeight = scene.ui.button.height * scale;
  let buttonHeight = scene.ui.button.height * scale;
  let buttonWidth = scene.ui.button.width * scale;
  let radius = scene.ui.button.radius * scale;
  let titleWidth = min(width - padding * 2, 420 * scale);
  let snapshotAspect = state.snapshot.width / state.snapshot.height;
  let paperSize = printPreviewPaperSize(snapshotAspect);

  let titleVisibleY =
    -height / 2 + padding * 2 + titleHeight * 1.5;
  let titleHiddenY = -height / 2 - padding - titleHeight / 2;
  let titleY = lerp(titleHiddenY, titleVisibleY, state.transition);
  let buttonVisibleY = height / 2 - padding - buttonHeight / 2;
  let buttonHiddenY = height / 2 + padding + buttonHeight / 2;
  let buttonY = lerp(buttonHiddenY, buttonVisibleY, state.transition);
  let buttonGap = padding / 2;
  let cancelX = -buttonGap / 2 - buttonWidth / 2;
  let okX = buttonGap / 2 + buttonWidth / 2;
  let planeHiddenY = height / 2 + paperSize.height / 2 + padding;
  let planeY = lerp(planeHiddenY, 0, state.transition);

  push();
  translate(0, 0, 128);
  resetShader();
  _renderer.GL.disable(_renderer.GL.CULL_FACE);
  _renderer.GL.clear(_renderer.GL.DEPTH_BUFFER_BIT);
  rectMode(CENTER);
  noStroke();
  fill(0, 255 * 0.5 * state.transition);
  rect(0, 0, width, height);
  _renderer.GL.clear(_renderer.GL.DEPTH_BUFFER_BIT);

  perspective(60, width / height, 10, 5000);
  push();
  translate(0, 0, -128);
  ambientLight(195);
  pointLight(
    60,
    60,
    60,
    -width * 0.28,
    -height * 0.32,
    650,
  );
  drawPrintPreviewPlane(
    state.snapshot,
    state.layers,
    paperSize.width,
    paperSize.height,
    paperSize.contentWidth,
    paperSize.contentHeight,
    planeY,
  );
  pop();
  ortho();
  _renderer.GL.clear(_renderer.GL.DEPTH_BUFFER_BIT);
  _renderer.GL.disable(_renderer.GL.CULL_FACE);

  scene.gui.printTitle.update(
    scene.elapsedTime,
    uiPointer(),
    uiPointerActive(),
  );
  scene.gui.printTitle.surface(
    0,
    titleY,
    titleWidth,
    titleHeight,
    radius,
  );

  resetShader();
  fill(255);
  textFont(scene.font);
  textAlign(CENTER, CENTER);
  textSize(titleHeight / 1.5);
  text("Card Preview", 0, titleY - titleHeight / 10);

  scene.gui.printCancel.armed =
    scene.ui.pointer.pressTarget == "printCancel";
  scene.gui.printCancel.update(
    scene.elapsedTime,
    uiPointer(),
    uiPointerActive(),
  );
  scene.gui.printCancel.button(
    cancelX,
    buttonY,
    buttonWidth,
    buttonHeight,
    radius,
  );

  scene.gui.printOk.armed = scene.ui.pointer.pressTarget == "printOk";
  scene.gui.printOk.update(
    scene.elapsedTime,
    uiPointer(),
    uiPointerActive(),
  );
  scene.gui.printOk.button(
    okX,
    buttonY,
    buttonWidth,
    buttonHeight,
    radius,
    1,
    ...scene.ui.actionColors.green,
  );

  pop();
}
