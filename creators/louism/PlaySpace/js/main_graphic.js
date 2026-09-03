function drawCompositionOuterTint() {
  if (!["frame", "active", "secretDemo"].includes(scene.session.mode)) return;
  let state = scene.composition;
  let editingCard = scene.session.mode == "active" && scene.text.edit;
  let bounds = editingCard ? creationCardBounds() : compositionBounds();
  let cornerRadius = editingCard
    ? creationCardCornerRadius(bounds)
    : compositionCornerRadius(bounds);
  let backgroundBrightness = constrain(
    scene.session.backgroundColor?.brightness ?? 0.5,
    0,
    1,
  );
  let marginGrey = (1 - backgroundBrightness) * 255;
  let tintKey = [
    width,
    height,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    editingCard ? "creation" : "composition",
    marginGrey,
  ].map((value) => round(value * 10) / 10).join("|");

  if (state.tintBuffer == null) {
    state.tintBuffer = createGraphics(width, height);
    state.tintBuffer.pixelDensity(1);
  } else if (
    state.tintBuffer.width != width ||
    state.tintBuffer.height != height
  ) {
    state.tintBuffer.resizeCanvas(width, height);
  }

  if (state.tintKey != tintKey) {
    let buffer = state.tintBuffer;
    let context = buffer.drawingContext;
    buffer.clear();
    buffer.rectMode(CORNER);
    buffer.noStroke();
    buffer.fill(marginGrey, 25.5);
    buffer.rect(0, 0, width, height);
    context.save();
    context.globalCompositeOperation = "destination-out";
    context.fillStyle = "rgba(0, 0, 0, 1)";
    context.beginPath();
    context.roundRect(
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      cornerRadius,
    );
    context.fill();
    context.restore();
    state.tintKey = tintKey;
  }

  push();
  resetShader();
  translate(0, 0, 2);
  imageMode(CENTER);
  image(state.tintBuffer, 0, 0, width, height);
  pop();
}

function draw() {
  updateUiScale();
  updateSessionCreationTimeout();
  let useFrameCursor =
    scene.session.mode == "frame" &&
    !scene.session.photoFrame.closed &&
    !scene.session.cameraPrompt.exitConfirming;
  if (useFrameCursor) noCursor();
  else cursor(ARROW);
  setUiPointer();
  updateUiPointer();
  updateOptionsWorkspaceLayout();
  updateControlSideTransition();

  background(0);
  let canvasGl = _renderer.GL;
  canvasGl.clear(canvasGl.DEPTH_BUFFER_BIT);
  ortho(-width/2, width/2, -height/2, height/2, -min(width, height));
  let workspaceGl = scene.workspace._renderer.GL;
  workspaceGl.clear(workspaceGl.DEPTH_BUFFER_BIT);
  scene.workspace.ortho();

  drawSessionWorkspaceBackground();
  if (["frame", "active", "secretDemo"].includes(scene.session.mode)) {
    drawSelectedFlowBackground(scene.workspace);
    drawSelectedFlowCreationCard(scene.workspace);
  }
  drawHomeGallery(scene.workspace);

  scene.elapsedTime = millis() / 1000.0;
  inout.audio.update();
  inout.audio.ui?.update();
  let previewBaseSnapshot = scene.ui.printPreview.pending
    ? cardPreviewSnapshot(scene.workspace)
    : null;

  // scene.shader.setUniform("spectrum", inout.audio.spectrum.texture);
  // scene.shader.setUniform("texture0", scene.workspace);

  // scene.shader.setUniform("maxRayBounces", scene.maxRayBounces);
  // scene.shader.setUniform("u_time", scene.elapsedTime);
  // scene.shader.setUniform("u_resolution", [width, height]);
  // scene.shader.setUniform("u_mouse", [mouseX, mouseY]);

  let creationCard = creationCardBounds();
  let baseTextSize = min(creationCard.width, creationCard.height) / 4;
  scene.workspace.textAlign(CENTER, CENTER);

  if (data.loading.ready) {
    if (scene.session.mode == "secretDemo") {
      drawCreationDemoContent(baseTextSize);
    } else {
      drawLayeredWorkspaceContent(baseTextSize);
    }
    if (["frame", "active", "secretDemo"].includes(scene.session.mode)) {
      drawFrameOverlay(scene.workspace);
    }
  }
  drawSessionPhotoCountdownPattern(
    scene.workspace,
    scene.session.cameraPrompt.transition,
  );
  imageMode(CENTER);
  image(scene.workspace, 0, 0, width, height);
  drawCompositionOuterTint();
  capturePrintPreview(previewBaseSnapshot);
  let previewModelView = scene.ui.printPreview.open
    ? _renderer.uMVMatrix.mat4.slice()
    : null;
  let previewProjection = scene.ui.printPreview.open
    ? _renderer.uPMatrix.mat4.slice()
    : null;

  // orbitControl();
  push();
  translate(0, 0, scene.layer.ui);

  data.loading.bar();
  drawSecretDemoStatus();

  noStroke();

  let printButton = uiButtonBounds("left");
  let controlsPadding = scene.ui.button.padding * scene.ui.scale;
  let controlsVisibleY = uiSafeBottomY(
    controlsPadding + printButton.h / 2,
  );
  let controlsHiddenY = uiHiddenBottomY(printButton.h, controlsPadding);
  scene.ui.textField.position = animateData(
    scene.ui.textField.position,
    scene.text.edit ? 1 : 0,
    0.25,
  );
  let editTransition = scene.ui.textField.position;
  scene.ui.controls.position = animateData(
    scene.ui.controls.position,
    data.loading.ready && scene.session.mode == "active" ? 1 : 0,
    0.125,
  );
  let controlsY = map(
    scene.ui.controls.position,
    0,
    1,
    controlsHiddenY,
    controlsVisibleY,
  );
  printButton.y = controlsY;
  let printVisibleX = printButton.x;
  let printHiddenX = uiHiddenLeftX(
    printButton.w,
    scene.ui.button.padding * scene.ui.scale,
  );
  printButton.x = map(
    editTransition,
    0,
    1,
    printVisibleX,
    printHiddenX,
  );
  scene.gui.print.armed = scene.ui.pointer.pressTarget == "print";
  drawFlowSliceButton(
    scene.gui.print,
    "finish",
    printButton.x,
    printButton.y,
    printButton.w * 1.45,
    printButton.h * 1.35,
  );

  drawColorPanel(scene.ui.colorPanel.color);
  drawTexturePad();
  drawLayerBar();
  drawControlSideSwitch();

  let fieldGap = scene.ui.textField.gap * scene.ui.scale;
  let doneButton = uiButtonBounds("right");
  let editDoneY =
    uiSafeBottomY(
      scene.ui.button.padding * scene.ui.scale + doneButton.h / 2,
    );
  doneButton.y = lerp(controlsY, editDoneY, editTransition);

  let fieldHeight = printButton.h;
  let fieldRadius = printButton.r;
  let fieldClosedY = printButton.y;
  let fieldOpenY =
    uiSafeTopY(
      scene.ui.button.padding * scene.ui.scale + fieldHeight / 2,
    );
  let fieldVisibleY = lerp(fieldClosedY, fieldOpenY, editTransition);
  let doneHiddenX = uiHiddenRightX(
    doneButton.w,
    scene.ui.button.padding * scene.ui.scale,
  );
  let doneX = map(editTransition, 0, 1, doneHiddenX, 0);

  scene.gui.done.armed = scene.ui.pointer.pressTarget == "done";
  drawFlowSliceButton(
    scene.gui.done,
    "nextGreen",
    doneX,
    doneButton.y,
    doneButton.w * 1.45,
    doneButton.h * 1.35,
  );

  let doneBounds = scene.gui.done.bounds || doneButton;
  let fieldClosedLeft = printVisibleX + printButton.w / 2 + fieldGap;
  let fieldOpenLeft =
    -width / 2 +
    scene.ui.safeArea.left +
    scene.ui.button.padding * scene.ui.scale +
    138 * scene.ui.scale;
  let fieldLeft = map(
    editTransition,
    0,
    1,
    fieldClosedLeft,
    fieldOpenLeft,
  );
  let fieldRight = map(
    editTransition,
    0,
    1,
    width / 2 - scene.ui.safeArea.right -
      scene.ui.button.padding * scene.ui.scale,
    width / 2 -
      scene.ui.safeArea.right -
      scene.ui.button.padding * scene.ui.scale -
      172 * scene.ui.scale,
  );
  let fieldWidth = max(0, fieldRight - fieldLeft);
  let fieldX = (fieldLeft + fieldRight) / 2;
  let closedEdit = uiButtonBounds("right");
  closedEdit.y = fieldClosedY;
  let editX = map(editTransition, 0, 1, closedEdit.x, fieldX);
  let editY = fieldVisibleY;
  let editWidth = map(editTransition, 0, 1, closedEdit.w, fieldWidth);

  if (fieldWidth > 0) {
    if (scene.text.edit) {
      scene.ui.textField.label = textFieldDisplayLabel(
        max(0, editWidth - fieldHeight),
        fieldHeight / 1.25,
      );
    }

    let drawAsField = scene.text.edit || editTransition > 0.35;
    scene.gui.edit.label = drawAsField ? scene.ui.textField.label : "Edit";
    scene.gui.edit.selection = drawAsField
      ? scene.ui.textField.selection
      : null;
    scene.gui.edit.labelOpacity = drawAsField
      ? scene.ui.textField.opacity
      : null;
    scene.gui.edit.labelScales = drawAsField
      ? scene.ui.textField.scales
      : null;
    scene.gui.edit.labelRotations = drawAsField
      ? scene.ui.textField.rotations
      : null;
    scene.gui.edit.labelOffsets = drawAsField
      ? scene.ui.textField.offsets
      : null;
    scene.gui.edit.armed = scene.ui.pointer.pressTarget == "edit";
    scene.gui.edit.update(scene.elapsedTime, uiPointer(), uiPointerActive());
    if (drawAsField) {
      scene.gui.edit.field(
        editX,
        editY,
        editWidth,
        fieldHeight,
        fieldRadius,
        0,
        0,
        100,
        false,
      );
    } else {
      drawFlowSliceButton(
        scene.gui.edit,
        "edit",
        editX,
        editY,
        editWidth * 1.45,
        fieldHeight * 1.35,
      );
      scene.ui.textField.label = "Edit";
    }
  }

  pop();

  if (scene.ui.printPreview.open) {
    _renderer.uMVMatrix.mat4.set(previewModelView);
    _renderer.uPMatrix.mat4.set(previewProjection);
    resetShader();
    drawPrintPreview();
  }

  drawCameraSessionFrontUi();
  drawPhotoFrameStage();
  drawEditorSessionChrome();
  drawBackgroundFramePicker();
  drawDebugGuides();

  ////

  // let bbox = scene.font.textBounds(left + cursor + right, 0, 0);

  // text(left + cursor + right, -bbox.w / 2, 0);

  ////

  // DYNAMIC SCALING
  // dynamicScaling(scene.fps.minimum, scene.fps.maximum);
}

function drawControlSideSwitch() {
  let visible =
    data.loading.ready &&
    scene.session.mode == "active" &&
    scene.text.edit;
  let state = scene.ui.sideSwitch;
  state.position = animateData(state.position, visible ? 1 : 0, 0.25);
  if (!visible && state.position < 0.001) {
    scene.gui.sideSwitch.bounds = null;
    return;
  }

  let scale = scene.ui.scale;
  let size = scene.ui.button.height * scale;
  let padding = scene.ui.button.padding * scale;
  let leftX = -width / 2 + padding + size / 2;
  let rightX = width / 2 - padding - size / 2;
  let x = lerp(rightX, leftX, controlSideMix());
  let visibleY = uiSafeBottomY(padding + size / 2);
  let hiddenY = uiHiddenBottomY(size, padding);
  let y = lerp(hiddenY, visibleY, state.position);
  scene.gui.sideSwitch.label = controlsOnRight() ? "<" : ">";
  scene.gui.sideSwitch.armed =
    scene.ui.pointer.pressTarget == "sideSwitch";
  scene.gui.sideSwitch.bounds = { x, y, w: size, h: size };
  push();
  resetShader();
  noStroke();
  fill(scene.gui.sideSwitch.armed ? color(205, 221, 70) : color(79, 15, 47));
  circle(x, y + (scene.gui.sideSwitch.armed ? 3 * scale : 0), size);
  textAlign(CENTER, CENTER);
  textFont(scene.font);
  textSize(size * 0.55);
  fill(scene.gui.sideSwitch.armed ? color(79, 15, 47) : color(255, 235, 221));
  text(
    scene.gui.sideSwitch.label,
    x,
    y - size * 0.04 + (scene.gui.sideSwitch.armed ? 3 * scale : 0),
  );
  pop();
}

function drawDebugGuides() {
  if (!scene.debug.guides) return;

  let guideX = constrain(mouseX, 0, width) - width / 2;
  let guideY = constrain(mouseY, 0, height) - height / 2;
  push();
  resetMatrix();
  ortho();
  resetShader();
  _renderer.GL.clear(_renderer.GL.DEPTH_BUFFER_BIT);
  stroke(255, 0, 0);
  strokeWeight(1);
  line(guideX, -height / 2, guideX, height / 2);
  line(-width / 2, guideY, width / 2, guideY);
  pop();
}

function drawWordOnTextPath(txt, path, textSizeValue, pathIndex, layerZ = 0) {
  let points = boilingPath(textRenderBasePath(path));
  let lengths = points.length >= 2 ? buildLengths(points) : [];
  if (points.length < 2 || lengths.length < 2) return;

  let total = lengths[lengths.length - 1];
  let textureMix = textureMixForWordIndex(pathIndex);
  let glyphGroups = textGlyphGroupsForWord(pathIndex + 1, txt.length, textureMix);

  if (scene.text.edit && !scene.ui.printPreview.pending) {
    scene.workspace.push();
    scene.workspace.translate(
      -width / 2,
      -height / 2,
      scene.layer.content + layerZ,
    );
    scene.workspace.stroke(255, 0, 0, 125);
    scene.workspace.strokeWeight(2);
    scene.workspace.noFill();
    scene.workspace.beginShape();
    for (let point of points) scene.workspace.vertex(point.x, point.y);
    scene.workspace.endShape();
    scene.workspace.pop();
  }

  if (txt == "") return;

  let pathEndMargin = min(textSizeValue * 0.35, total * 0.15);
  let textPathStart = pathEndMargin;
  let textPathEnd = total - pathEndMargin;
  for (let i = 0; i < txt.length; i++) {
    let distance =
      txt.length > 1
        ? map(i, 0, txt.length - 1, textPathStart, textPathEnd)
        : total / 2;
    let point = pointOnPath(points, lengths, distance);
    let angleStep = max(1, total * 0.002);
    let angleStart = max(0, distance - angleStep);
    let angleEnd = min(total, distance + angleStep);
    let anglePointAfter = pointOnPath(points, lengths, angleEnd);
    let anglePointBefore = pointOnPath(points, lengths, angleStart);
    let angle = atan2(
      anglePointAfter.y - anglePointBefore.y,
      anglePointAfter.x - anglePointBefore.x,
    );
    let endpointDistance = min(i, txt.length - 1 - i);
    let endpointAngleAmount = constrain(
      map(endpointDistance, 0, 2, 0.35, 1),
      0.35,
      1,
    );
    angle *= endpointAngleAmount;

    let pointer = uiPointer();
    let pointerDistance = dist(pointer[0], pointer[1], point.x, point.y);
    let touchInfluence = constrain(
      1 - pointerDistance / scene.text.boil.touchGrowRadius,
      0,
      1,
    );
    touchInfluence =
      touchInfluence * touchInfluence * (3 - 2 * touchInfluence);
    let touchGrow = scene.text.edit
      ? 0
      : touchInfluence * uiPointerActive() * scene.text.boil.touchGrowAmount;

    scene.workspace.push();
    scene.workspace.translate(
      point.x - width / 2,
      point.y - height / 2,
      scene.layer.content + layerZ,
    );
    scene.workspace.rotate(angle);
    scene.workspace.scale(1 + touchGrow);
    drawTextGlyphImage(
      scene.workspace,
      txt[i],
      textSizeValue,
      pathIndex * 1000 + i + 1,
      glyphGroups[i],
    );
    scene.workspace.pop();
  }
}

function windowResized() {
  let previousWidth = width;
  let previousHeight = height;
  let previousCardBounds = creationCardBounds();
  resizeCanvas(windowWidth, windowHeight);
  scene.workspace.resizeCanvas(width * scene.pixScale, height * scene.pixScale);
  updateUiScale();
  if (previousWidth > 0 && previousHeight > 0) {
    remapArtworkBetweenBounds(previousCardBounds, creationCardBounds());
  }
  scene.session.photoFrame.dirty = true;
  scheduleSessionCacheSave();
  if (["frame", "active"].includes(scene.session.mode)) {
    saveTextMemory();
  }
}
