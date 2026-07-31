function keyPressed() {
  userStartAudio();

  if (keyCode === TAB) {
    setTextEdit(!scene.text.edit);
    return false;
  }

  if (keyCode === ENTER || keyCode === RETURN) {
    if (scene.text.edit) {
      setTextEdit(false);
    }
    return false;
  }

  if (scene.text.edit) {
    syncTextCursorFromInput();
  }
}

function moveVertical(dir) {
  let before = scene.text.buffer.substring(0, scene.text.cursor.pos);
  let linesBefore = before.split("\n");
  let line = linesBefore.length - 1;
  let allLines = scene.text.buffer.split("\n");
  let targetLine = line + dir;
  if (targetLine < 0 || targetLine >= allLines.length) {
    return;
  }

  let targetColumn = min(
    scene.text.cursor.preferredColumn,
    allLines[targetLine].length,
  );
  let pos = 0;

  for (let i = 0; i < targetLine; i++) {
    pos += allLines[i].length + 1;
  }

  scene.text.cursor.pos = pos + targetColumn;
}

function uiButtonAtPointer() {
  if (scene.text.edit && scene.text.activeWord >= 0) {
    if (demo) {
      for (let channel of ["hue", "saturation", "brightness"]) {
        if (scene.gui[channel].hitTest()) return channel;
      }
    } else {
      let colorPanelTarget = colorPanelTargetAtPointer();
      if (colorPanelTarget != null) return colorPanelTarget;
    }
    if (scene.gui.contentScale.hitTest()) return "contentScale";
  }

  if (scene.gui.done.hitTest()) {
    return "done";
  }

  if (scene.gui.edit.hitTest()) {
    return "edit";
  }

  if (scene.gui.save.hitTest()) {
    return "save";
  }

  return null;
}

function beginUiButtonPress() {
  scene.ui.pointer.pressTarget = uiButtonAtPointer();
  scene.ui.pointer.pressStartedOnButton = scene.ui.pointer.pressTarget != null;
  if (!demo && beginColorPanelInteraction(scene.ui.pointer.pressTarget)) {
    return true;
  }
  if (scene.ui.pointer.pressTarget == "contentScale") {
    scene.ui.slider.active = "contentScale";
    let value = sliderValueFromPointer(scene.gui.contentScale.bounds);
    setTextScaleValue(value);
    inout.audio.ui?.slide("contentScale", value, mouseX / width);
  }
  if (
    demo &&
    ["hue", "saturation", "brightness"].includes(
      scene.ui.pointer.pressTarget,
    )
  ) {
    scene.ui.slider.active = scene.ui.pointer.pressTarget;
    let value = horizontalSliderValueFromPointer(
      scene.gui[scene.ui.slider.active].bounds,
    );
    setTextColorValue(
      scene.ui.slider.active,
      value,
    );
    inout.audio.ui?.slide(scene.ui.slider.active, value, mouseX / width);
  }
  if (scene.text.edit && scene.ui.pointer.pressTarget == "edit") {
    focusTextInput();
    scene.ui.textField.cursorDrag.active = true;
    scene.ui.textField.cursorDrag.startX = mouseX;
    scene.ui.textField.cursorDrag.startPos = textFieldCursorFromPointer(mouseX);
    setTextSelection(
      scene.ui.textField.cursorDrag.startPos,
      scene.ui.textField.cursorDrag.startPos,
    );
  }
  return scene.ui.pointer.pressTarget != null;
}

function updateUiButtonPress() {
  if (!scene.ui.pointer.pressStartedOnButton) {
    return false;
  }

  if (scene.ui.textField.cursorDrag.active) {
    setTextSelection(
      scene.ui.textField.cursorDrag.startPos,
      textFieldCursorFromPointer(mouseX),
    );
    return true;
  }

  if (!demo && updateColorPanelInteraction(scene.ui.pointer.pressTarget)) {
    return true;
  }

  if (scene.ui.slider.active == "contentScale") {
    let value = sliderValueFromPointer(scene.gui.contentScale.bounds);
    setTextScaleValue(value);
    inout.audio.ui?.slide("contentScale", value, mouseX / width);
    return true;
  }

  if (
    demo &&
    ["hue", "saturation", "brightness"].includes(scene.ui.slider.active)
  ) {
    let value = horizontalSliderValueFromPointer(
      scene.gui[scene.ui.slider.active].bounds,
    );
    setTextColorValue(
      scene.ui.slider.active,
      value,
    );
    inout.audio.ui?.slide(scene.ui.slider.active, value, mouseX / width);
    return true;
  }

  if (uiButtonAtPointer() != scene.ui.pointer.pressTarget) {
    scene.ui.pointer.pressTarget = null;
  }

  return true;
}

function endUiButtonPress() {
  let pressTarget = scene.ui.pointer.pressTarget;
  let releaseTarget = uiButtonAtPointer();
  let startedOnButton = scene.ui.pointer.pressStartedOnButton;
  let cursorDragActive = scene.ui.textField.cursorDrag.active;
  scene.ui.textField.cursorDrag.active = false;
  scene.ui.slider.active = null;
  inout.audio.ui?.endControl(pressTarget);
  scene.ui.pointer.pressTarget = null;
  scene.ui.pointer.pressStartedOnButton = false;

  if (!demo && endColorPanelInteraction(pressTarget)) {
    return true;
  }

  if (cursorDragActive) {
    saveTextMemory();
    return true;
  }

  if (pressTarget == null || pressTarget != releaseTarget) {
    return startedOnButton;
  }

  if (["save", "edit", "done"].includes(releaseTarget)) {
    inout.audio.ui?.tap(releaseTarget, mouseX / width);
  }

  if (releaseTarget == "edit") {
    setTextEdit(true);
  } else if (releaseTarget == "done") {
    setTextEdit(false);
  }

  return true;
}

function beginTextPathGesture() {
  if (
    !scene.text.edit ||
    scene.text.activeWord < 0 ||
    (!scene.text.pathEditArmed &&
      textPathForWordIndex(scene.text.activeWord) != null)
  ) {
    return;
  }
  scene.text.pathGesture.active = true;
  scene.text.pathGesture.drawing = false;
  scene.text.pathGesture.pathIndex = -1;
  scene.text.pathGesture.start.x = mouseX;
  scene.text.pathGesture.start.y = mouseY;
}

function updateTextPathGesture() {
  let gesture = scene.text.pathGesture;
  if (!scene.text.edit || !gesture.active) return false;

  if (!gesture.drawing) {
    let movement = dist(gesture.start.x, gesture.start.y, mouseX, mouseY);
    if (movement < gesture.threshold * scene.ui.scale) return true;

    gesture.drawing = true;
    gesture.pathIndex = scene.text.activeWord;
    let deltaX = mouseX - gesture.start.x;
    let deltaY = mouseY - gesture.start.y;
    setTextPathForWordIndex(gesture.pathIndex, [
      createVector(gesture.start.x, gesture.start.y),
      createVector(
        gesture.start.x + deltaX / 3,
        gesture.start.y + deltaY / 3,
      ),
      createVector(
        gesture.start.x + (deltaX * 2) / 3,
        gesture.start.y + (deltaY * 2) / 3,
      ),
      createVector(mouseX, mouseY),
    ]);
  } else {
    let path = textPathForWordIndex(gesture.pathIndex);
    if (path != null) path.push(createVector(mouseX, mouseY));
  }

  saveTextMemory();
  return true;
}

function endTextPathGesture() {
  let completedPath = scene.text.pathGesture.drawing;
  scene.text.pathGesture.active = false;
  scene.text.pathGesture.drawing = false;
  scene.text.pathGesture.pathIndex = -1;

  if (completedPath) {
    saveTextMemory();
  }
}

function mousePressed() {
  userStartAudio();
  setUiPointer();
  setUiPointerActive(1);

  if (beginUiButtonPress()) {
    return false;
  }

  beginTextPathGesture();
}

function mouseReleased() {
  setUiPointer();

  if (endUiButtonPress()) {
    return false;
  }

  endTextPathGesture();
}

function mouseDragged() {
  setUiPointer();
  setUiPointerActive(1);
  if (updateUiButtonPress()) {
    return false;
  }

  updateTextPathGesture();
}

function mouseMoved() {
  setUiPointer();
  setUiPointerActive(1);
}

function touchStarted() {
  userStartAudio();
  setUiPointer();
  setUiPointerActive(1);
  if (beginUiButtonPress()) {
    return false;
  }

  beginTextPathGesture();

  return false;
}

function touchMoved() {
  setUiPointer();
  setUiPointerActive(1);
  if (updateUiButtonPress()) {
    return false;
  }

  updateTextPathGesture();

  return false;
}

function touchEnded() {
  setUiPointer();
  setUiPointerActive(0);
  endUiButtonPress();
  endTextPathGesture();
  return false;
}
