function checkerboardBuffer() {
  let state = scene.checkerboard;
  let bufferWidth = max(1, ceil(width));
  let bufferHeight = max(1, ceil(height));
  let sizeChanged =
    state.buffer == null ||
    state.width != bufferWidth ||
    state.height != bufferHeight;

  if (state.buffer == null) {
    state.buffer = createGraphics(bufferWidth, bufferHeight);
    state.buffer.pixelDensity(1);
  } else if (sizeChanged) {
    state.buffer.resizeCanvas(bufferWidth, bufferHeight);
  }

  if (sizeChanged) {
    let cellSize = min(bufferWidth, bufferHeight) / 16;
    let columns = ceil(bufferWidth / cellSize);
    let rows = ceil(bufferHeight / cellSize);
    state.buffer.background(125);
    state.buffer.noStroke();
    state.buffer.fill(155);

    for (let column = 0; column < columns; column++) {
      for (let row = 0; row < rows; row++) {
        if ((column + row) % 2 == 0) {
          state.buffer.rect(
            column * cellSize,
            row * cellSize,
            cellSize,
            cellSize,
          );
        }
      }
    }

    state.width = bufferWidth;
    state.height = bufferHeight;
  }

  return state.buffer;
}

function draw() {
  updateUiScale();
  setUiPointer();
  updateUiPointer();

  background(0);
  let canvasGl = _renderer.GL;
  canvasGl.clear(canvasGl.DEPTH_BUFFER_BIT);
  ortho();
  let workspaceGl = scene.workspace._renderer.GL;
  workspaceGl.clear(workspaceGl.DEPTH_BUFFER_BIT);
  scene.workspace.ortho();

  scene.workspace.push();
  scene.workspace.imageMode(CENTER);
  scene.workspace.image(checkerboardBuffer(), 0, 0, width, height);
  scene.workspace.pop();

  scene.elapsedTime = millis() / 1000.0;
  inout.audio.update();
  inout.audio.ui?.update();

  // scene.shader.setUniform("spectrum", inout.audio.spectrum.texture);
  // scene.shader.setUniform("texture0", scene.workspace);

  // scene.shader.setUniform("maxRayBounces", scene.maxRayBounces);
  // scene.shader.setUniform("u_time", scene.elapsedTime);
  // scene.shader.setUniform("u_resolution", [width, height]);
  // scene.shader.setUniform("u_mouse", [mouseX, mouseY]);

  let baseTextSize = min(width, height) / 4;
  scene.workspace.textAlign(CENTER, CENTER);

  if (data.loading.ready) {
    let words = textWords();
    for (let pathIndex = 0; pathIndex < words.length; pathIndex++) {
      let path = textPathForWordIndex(pathIndex);
      if (path == null) continue;
      let textSizeValue = textSizeForWordIndex(pathIndex, baseTextSize);
      drawWordOnTextPath(
        words[pathIndex],
        path,
        textSizeValue,
        pathIndex,
      );
    }
  }

  imageMode(CENTER);
  image(scene.workspace, 0, 0, width, height);

  // orbitControl();
  translate(0, 0, scene.layer.ui);

  push();
  data.loading.bar();

  noStroke();

  let saveButton = uiButtonBounds("left");
  let textScaleSlider = uiVerticalSliderBounds("right");
  scene.ui.controls.position = animateData(
    scene.ui.controls.position,
    data.loading.ready ? 1 : 0,
    0.125,
  );
  let controlsHiddenOffset = -(
    saveButton.h +
    scene.ui.button.padding * scene.ui.scale * 2
  );
  let controlsOffset = map(
    scene.ui.controls.position,
    0,
    1,
    controlsHiddenOffset,
    0,
  );
  saveButton.y += controlsOffset;
  let textScaleSliderVisibleX = textScaleSlider.x;
  let textScaleSliderHiddenX =
    width / 2 + textScaleSlider.w + scene.ui.button.padding * scene.ui.scale;
  scene.ui.sizePanel.position = animateData(
    scene.ui.sizePanel.position,
    scene.text.edit && data.loading.ready ? 1 : 0,
    0.25,
  );
  textScaleSlider.x = map(
    scene.ui.sizePanel.position,
    0,
    1,
    textScaleSliderHiddenX,
    textScaleSliderVisibleX,
  );
  scene.gui.save.armed = scene.ui.pointer.pressTarget == "save";
  scene.gui.save.update(scene.elapsedTime, uiPointer(), uiPointerActive());
  scene.gui.save.button(
    saveButton.x,
    saveButton.y,
    saveButton.w,
    saveButton.h,
    saveButton.r,
  );

  let color = textColorForWordIndex(scene.text.activeWord);
  if (demo) {
    drawHsbColorSliders(color, saveButton);
  } else {
    drawColorPanel(color);
  }

  scene.gui.contentScale.armed = scene.ui.pointer.pressTarget == "contentScale";
  scene.gui.contentScale.update(
    scene.elapsedTime,
    uiPointer(),
    uiPointerActive(),
  );
  scene.gui.contentScale.verticalSlider(
    textScaleSlider.x,
    textScaleSlider.y,
    textScaleSlider.w,
    textScaleSlider.h,
    textScaleSlider.r,
    textScaleValueForWordIndex(scene.text.activeWord),
    220,
    50,
    100,
  );

  let fieldGap = scene.ui.textField.gap * scene.ui.scale;
  let saveBounds = scene.gui.save.bounds || saveButton;
  let doneButton = uiButtonBounds("right");
  doneButton.y += controlsOffset;
  scene.ui.textField.position = animateData(
    scene.ui.textField.position,
    scene.text.edit ? 1 : 0,
    0.25,
  );
  let editTransition = scene.ui.textField.position;

  let fieldHeight = saveButton.h;
  let fieldRadius = saveButton.r;
  let fieldVisibleY = saveButton.y;
  let doneHiddenX =
    width / 2 + doneButton.w + scene.ui.button.padding * scene.ui.scale;
  let doneX = map(editTransition, 0, 1, doneHiddenX, doneButton.x);

  scene.gui.done.armed = scene.ui.pointer.pressTarget == "done";
  scene.gui.done.update(scene.elapsedTime, uiPointer(), uiPointerActive());
  scene.gui.done.button(
    doneX,
    doneButton.y,
    doneButton.w,
    doneButton.h,
    doneButton.r,
    scene.text.edit ? 1 : 0,
    84,
    64,
    100,
  );

  let doneBounds = scene.gui.done.bounds || doneButton;
  let fieldLeft = saveBounds.x + saveBounds.w / 2 + fieldGap;
  let fieldRight = map(
    editTransition,
    0,
    1,
    width / 2 - scene.ui.button.padding * scene.ui.scale,
    doneBounds.x - doneBounds.w / 2 - fieldGap,
  );
  let fieldWidth = max(0, fieldRight - fieldLeft);
  let fieldX = (fieldLeft + fieldRight) / 2;
  let closedEdit = uiButtonBounds("right");
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
      scene.gui.edit.button(editX, editY, editWidth, fieldHeight, fieldRadius);
      scene.ui.textField.label = "Edit";
    }
  }

  pop();

  resetShader();

  ////

  // let bbox = scene.font.textBounds(left + cursor + right, 0, 0);

  // text(left + cursor + right, -bbox.w / 2, 0);

  ////

  // DYNAMIC SCALING
  // dynamicScaling(scene.fps.minimum, scene.fps.maximum);
}

function drawWordOnTextPath(txt, path, textSizeValue, pathIndex) {
  let textColor = textColorForWordIndex(pathIndex);
  let points = boilingPath(smoothPath(path));
  let lengths = points.length >= 2 ? buildLengths(points) : [];
  if (points.length < 2 || lengths.length < 2) return;

  let total = lengths[lengths.length - 1];

  if (scene.text.edit) {
    scene.workspace.push();
    scene.workspace.translate(-width / 2, -height / 2, scene.layer.content);
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
      scene.layer.content,
    );
    scene.workspace.rotate(angle);
    scene.workspace.scale(1 + touchGrow);
    drawBoilingGlyph(
      scene.workspace,
      txt[i],
      textSizeValue,
      pathIndex * 1000 + i + 1,
      textColor,
    );
    scene.workspace.pop();
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  scene.workspace.resizeCanvas(width * scene.pixScale, height * scene.pixScale);
  updateUiScale();
}
