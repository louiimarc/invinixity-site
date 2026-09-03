function keyPressed(event) {
  userStartAudio();

  if (scene.homeGallery.rescan.element != null) {
    if (keyCode === ESCAPE) closeHomeGalleryRescan();
    return false;
  }

  if (key === "∑") {
    if (!event?.repeat) toggleHomeGalleryModeration();
    return false;
  }

  if (scene.homeGallery.moderation.open) {
    if (keyCode === ESCAPE) closeHomeGalleryModeration(false);
    return false;
  }

  if (key === "π") {
    if (!event?.repeat) toggleSecretSessionMode();
    return false;
  }

  if (key === "ø") {
    if (!event?.repeat) toggleSecretDemo();
    return false;
  }

  if (scene.secretDemo.open) {
    if (keyCode === LEFT_ARROW) seekSecretDemo(-1);
    else if (keyCode === RIGHT_ARROW) seekSecretDemo(1);
    else if (keyCode === ESCAPE) closeSecretDemo();
    return false;
  }

  if (key === "?") {
    if (!event?.repeat) {
      scene.debug.guides = !scene.debug.guides;
    }
    return false;
  }

  if (sessionCameraPromptOpen()) {
    if (keyCode === ESCAPE && !scene.session.cameraPrompt.confirming) {
      if (scene.session.cameraPrompt.exitConfirming) {
        closeSessionCameraExitConfirmation();
      } else {
        openSessionCameraExitConfirmation();
      }
    }
    return false;
  }

  if (scene.ui.backgroundPicker.open) {
    if (keyCode === ESCAPE) {
      closeBackgroundFramePicker();
      setTextEdit(true);
    }
    return false;
  }

  if (scene.ui.printPreview.open) {
    if (keyCode === ESCAPE) closePrintPreview();
    return false;
  }

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
  if (sessionCameraPromptOpen()) {
    if (
      scene.session.cameraPrompt.exitConfirming ||
      scene.session.cameraPrompt.exitTransition > 0.05
    ) {
      if (
        scene.session.cameraPrompt.exitConfirming &&
        scene.session.cameraPrompt.exitTransition > 0.9 &&
        scene.gui.cameraExitCancel.hitTest()
      ) {
        return "cameraExitCancel";
      }
      if (
        scene.session.cameraPrompt.exitConfirming &&
        scene.session.cameraPrompt.exitTransition > 0.9 &&
        scene.gui.cameraExitYes.hitTest()
      ) {
        return "cameraExitYes";
      }
      return "cameraExitPrompt";
    }
    if (
      scene.session.cameraPrompt.closing ||
      scene.session.cameraPrompt.confirming
    ) {
      return "cameraPrompt";
    }
    if (scene.session.cameraPrompt.transition < 0.9) return "cameraPrompt";
    if (scene.gui.cameraExit.hitTest()) return "cameraExit";
    if (scene.gui.cameraTake.hitTest()) return "cameraTake";
    if (
      scene.session.camera.status == "captured" &&
      scene.session.camera.nextTransition > 0.9 &&
      scene.gui.cameraNext.hitTest()
    ) {
      return "cameraNext";
    }
    return "cameraPrompt";
  }

  if (
    scene.ui.printPreview.pending ||
    scene.ui.backgroundPicker.finalizing
  ) return "flowTransition";

  if (scene.ui.backgroundPicker.open) {
    return backgroundFramePickerTargetAtPointer();
  }

  if (scene.ui.printPreview.open) {
    if (scene.ui.printPreview.closing) return "printPreview";
    if (scene.gui.printCancel.hitTest()) return "printCancel";
    if (scene.gui.printOk.hitTest()) return "printOk";
    return "printPreview";
  }

  if (scene.session.mode == "frame") {
    scene.gui.frameExit.bounds = null;
  }

  if (scene.session.mode == "active") {
    if (
      scene.session.cameraPrompt.exitConfirming ||
      scene.session.cameraPrompt.exitTransition > 0.05
    ) {
      if (
        scene.session.cameraPrompt.exitConfirming &&
        scene.session.cameraPrompt.exitTransition > 0.9 &&
        scene.gui.cameraExitCancel.hitTest()
      ) {
        return "cameraExitCancel";
      }
      if (
        scene.session.cameraPrompt.exitConfirming &&
        scene.session.cameraPrompt.exitTransition > 0.9 &&
        scene.gui.cameraExitYes.hitTest()
      ) {
        return "cameraExitYes";
      }
      return "editorExitPrompt";
    }
    if (scene.gui.frameExit.hitTest()) return "frameExit";
    if (scene.text.edit) {
      if (scene.gui.editorUndo.hitTest()) return "editorUndo";
      if (scene.gui.editorRedo.hitTest()) return "editorRedo";
      if (scene.gui.editorDelete.hitTest()) return "editorDelete";
    }
  }

  if (scene.session.mode == "frame" && scene.session.photoFrame.closed) {
    if (
      scene.session.photoFrame.reviewTransition > 0.9 &&
      scene.gui.frameNext.hitTest()
    ) {
      return "frameNext";
    }
    if (
      scene.session.photoFrame.reviewTransition > 0.9 &&
      scene.gui.frameRedraw.hitTest()
    ) {
      return "frameRedraw";
    }
    return "frameReview";
  }

  if (
    scene.session.mode == "idle" &&
    data.loading.ready &&
    data.loading.interface.hitTest()
  ) {
    return "sessionStart";
  }

  if (scene.text.edit) {
    if (scene.gui.sideSwitch.hitTest()) return "sideSwitch";
    let colorPanelTarget = colorPanelTargetAtPointer();
    if (colorPanelTarget != null) return colorPanelTarget;
    let layerTarget = layerBarTargetAtPointer();
    if (layerTarget != null) return layerTarget;
    let textureTarget = texturePadTargetAtPointer();
    if (textureTarget != null) return textureTarget;
  }

  if (scene.gui.done.hitTest()) {
    return "done";
  }

  if (scene.gui.edit.hitTest()) {
    return "edit";
  }

  if (!scene.text.edit && scene.gui.print.hitTest()) {
    return "print";
  }

  return null;
}

function beginUiButtonPress() {
  if (sessionCameraPromptOpen()) {
    scene.ui.pointer.pressTarget = uiButtonAtPointer();
    if (
      [
        "cameraTake",
        "cameraNext",
        "cameraExit",
        "cameraExitCancel",
        "cameraExitYes",
      ].includes(
        scene.ui.pointer.pressTarget,
      )
    ) {
      scene.ui.pointer.pressStartedOnButton = true;
    }
    return true;
  }

  if (scene.ui.backgroundPicker.open) {
    scene.ui.pointer.pressTarget = backgroundFramePickerTargetAtPointer();
    scene.ui.pointer.pressStartedOnButton = [
      "backgroundCancel",
      "backgroundNext",
    ].includes(scene.ui.pointer.pressTarget);
    if (!scene.ui.pointer.pressStartedOnButton) {
      beginBackgroundFramePickerGesture();
    }
    return true;
  }

  if (scene.ui.printPreview.open) {
    scene.ui.pointer.pressTarget = uiButtonAtPointer();
    if (scene.ui.printPreview.closing) {
      return true;
    }
    if (["printCancel", "printOk"].includes(scene.ui.pointer.pressTarget)) {
      scene.ui.pointer.pressStartedOnButton = true;
      return true;
    }
    beginPrintPreviewDrag();
    return true;
  }

  scene.ui.pointer.pressTarget = uiButtonAtPointer();
  scene.ui.pointer.pressStartedOnButton = scene.ui.pointer.pressTarget != null;
  if (beginColorPanelInteraction(scene.ui.pointer.pressTarget)) {
    return true;
  }
  if (beginLayerBarInteraction(scene.ui.pointer.pressTarget)) {
    return true;
  }
  if (beginTexturePadInteraction(scene.ui.pointer.pressTarget)) {
    return true;
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
  if (
    scene.ui.backgroundPicker.open &&
    scene.ui.backgroundPicker.drag.active
  ) {
    updateBackgroundFramePickerGesture();
    return true;
  }

  if (
    sessionCameraPromptOpen() &&
    scene.ui.pointer.pressStartedOnButton
  ) {
    if (uiButtonAtPointer() != scene.ui.pointer.pressTarget) {
      scene.ui.pointer.pressTarget = null;
    }
    return true;
  }

  if (sessionCameraPromptOpen()) return true;

  if (scene.ui.printPreview.open && scene.ui.printPreview.drag.active) {
    updatePrintPreviewDrag();
    return true;
  }

  if (
    scene.ui.printPreview.open &&
    scene.ui.pointer.pressStartedOnButton
  ) {
    if (uiButtonAtPointer() != scene.ui.pointer.pressTarget) {
      scene.ui.pointer.pressTarget = null;
    }
    return true;
  }

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

  if (updateColorPanelInteraction(scene.ui.pointer.pressTarget)) {
    return true;
  }
  if (updateLayerBarInteraction(scene.ui.pointer.pressTarget)) {
    return true;
  }
  if (updateTexturePadInteraction(scene.ui.pointer.pressTarget)) {
    return true;
  }

  if (uiButtonAtPointer() != scene.ui.pointer.pressTarget) {
    scene.ui.pointer.pressTarget = null;
  }

  return true;
}

function endUiButtonPress() {
  if (
    scene.ui.backgroundPicker.open &&
    scene.ui.backgroundPicker.drag.active
  ) {
    let releaseTarget = backgroundFramePickerTargetAtPointer();
    endBackgroundFramePickerGesture(releaseTarget);
    scene.ui.pointer.pressTarget = null;
    scene.ui.pointer.pressStartedOnButton = false;
    return true;
  }

  if (scene.ui.printPreview.open && scene.ui.printPreview.drag.active) {
    endPrintPreviewDrag();
    return true;
  }

  let pressTarget = scene.ui.pointer.pressTarget;
  let releaseTarget = uiButtonAtPointer();
  let startedOnButton = scene.ui.pointer.pressStartedOnButton;
  let cursorDragActive = scene.ui.textField.cursorDrag.active;
  scene.ui.textField.cursorDrag.active = false;
  inout.audio.ui?.endControl(pressTarget);
  scene.ui.pointer.pressTarget = null;
  scene.ui.pointer.pressStartedOnButton = false;

  if (endColorPanelInteraction(pressTarget)) {
    return true;
  }
  if (endLayerBarInteraction(pressTarget)) {
    return true;
  }
  if (endTexturePadInteraction(pressTarget)) {
    return true;
  }

  if (cursorDragActive) {
    saveTextMemory();
    return true;
  }

  if (pressTarget == null || pressTarget != releaseTarget) {
    return startedOnButton;
  }

  if (
    [
      "sessionStart",
      "cameraExit",
      "cameraExitCancel",
      "cameraExitYes",
      "frameExit",
      "editorUndo",
      "editorRedo",
      "editorDelete",
      "cameraNext",
      "frameNext",
      "frameRedraw",
      "print",
      "printCancel",
      "printOk",
      "edit",
      "done",
      "sideSwitch",
      "backgroundCancel",
      "backgroundNext",
    ].includes(
      releaseTarget,
    )
  ) {
    inout.audio.ui?.tap(releaseTarget, mouseX / width);
  }

  if (releaseTarget == "sessionStart") {
    if (!beginSecretSession()) openSessionCameraPrompt();
  } else if (releaseTarget == "cameraTake") {
    if (scene.session.camera.status == "captured") {
      retakeSessionPhoto();
    } else {
      beginSessionPhotoCountdown();
    }
  } else if (releaseTarget == "cameraNext") {
    acceptSessionPhoto();
  } else if (releaseTarget == "cameraExit") {
    openSessionCameraExitConfirmation();
  } else if (releaseTarget == "cameraExitCancel") {
    closeSessionCameraExitConfirmation();
  } else if (releaseTarget == "cameraExitYes") {
    confirmSessionCameraExit();
  } else if (releaseTarget == "frameExit") {
    openSessionCameraExitConfirmation();
  } else if (releaseTarget == "editorUndo") {
    undoEditorChange();
  } else if (releaseTarget == "editorRedo") {
    redoEditorChange();
  } else if (releaseTarget == "editorDelete") {
    clearAllTextPaths();
  } else if (releaseTarget == "frameNext") {
    acceptSessionPhotoFrame();
  } else if (releaseTarget == "frameRedraw") {
    redrawSessionPhotoFrame();
  } else if (releaseTarget == "print") {
    openBackgroundFramePicker();
  } else if (releaseTarget == "printCancel") {
    closePrintPreview(false);
  } else if (releaseTarget == "printOk") {
    let saveAsExample = scene.secretSession.recording;
    captureCurrentCreationRecipe();
    scene.ui.printPreview.saveAsExample = saveAsExample;
    closePrintPreview(true);
  } else if (releaseTarget == "edit") {
    setTextEdit(true);
  } else if (releaseTarget == "done") {
    setTextEdit(false);
    openBackgroundFramePicker();
  } else if (releaseTarget == "sideSwitch") {
    toggleControlSide();
  } else if (releaseTarget == "backgroundCancel") {
    closeBackgroundFramePicker();
    setTextEdit(true);
  } else if (releaseTarget == "backgroundNext") {
    confirmBackgroundFramePicker();
  }

  return true;
}

function beginTextPathGesture() {
  if (!scene.text.edit) return;
  let start = constrainPointToCreationCard(mouseX, mouseY, true);
  scene.text.pathGesture.active = true;
  scene.text.pathGesture.drawing = false;
  scene.text.pathGesture.drawable =
    scene.text.activeWord >= 0 &&
    pointInsideCreationCard(mouseX, mouseY, true) &&
    (scene.text.pathEditArmed ||
      textPathForWordIndex(scene.text.activeWord) == null);
  scene.text.pathGesture.moved = false;
  scene.text.pathGesture.pathIndex = -1;
  scene.text.pathGesture.start.x = start.x;
  scene.text.pathGesture.start.y = start.y;
}

function updateTextPathGesture() {
  let gesture = scene.text.pathGesture;
  if (!scene.text.edit || !gesture.active) return false;
  let pointer = constrainPointToCreationCard(mouseX, mouseY, true);

  if (!gesture.drawing) {
    let movement = dist(gesture.start.x, gesture.start.y, mouseX, mouseY);
    if (movement < gesture.threshold * scene.ui.scale) return true;
    gesture.moved = true;
    if (!gesture.drawable) return true;

    gesture.drawing = true;
    gesture.pathIndex = scene.text.activeWord;
    let deltaX = pointer.x - gesture.start.x;
    let deltaY = pointer.y - gesture.start.y;
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
      pointer,
    ]);
  } else {
    let path = textPathForWordIndex(gesture.pathIndex);
    if (path != null) path.push(pointer);
  }

  saveTextMemory();
  return true;
}

function endTextPathGesture() {
  let completedPath = scene.text.pathGesture.drawing;
  let selectCanvasItem =
    scene.text.pathGesture.active && !scene.text.pathGesture.moved;
  scene.text.pathGesture.active = false;
  scene.text.pathGesture.drawing = false;
  scene.text.pathGesture.drawable = false;
  scene.text.pathGesture.moved = false;
  scene.text.pathGesture.pathIndex = -1;

  if (completedPath) {
    saveTextMemory();
    recordEditorHistory();
  }
  if (selectCanvasItem) {
    selectLayerItemAtCanvasPointer();
  }
}

function mousePressed() {
  userStartAudio();
  setUiPointer();
  setUiPointerActive(1);

  if (beginPhotoFrameGesture()) {
    return false;
  }

  if (beginUiButtonPress()) {
    return false;
  }

  if (beginHomeGalleryGesture()) {
    return false;
  }

  beginTextPathGesture();
}

function mouseReleased() {
  setUiPointer();

  if (endPhotoFrameGesture()) {
    return false;
  }

  if (endUiButtonPress()) {
    return false;
  }

  if (endHomeGalleryGesture()) {
    return false;
  }

  endTextPathGesture();
}

function mouseDragged() {
  setUiPointer();
  setUiPointerActive(1);
  if (updatePhotoFrameGesture()) {
    return false;
  }
  if (updateUiButtonPress()) {
    return false;
  }

  if (updateHomeGalleryGesture()) {
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
  if (beginPhotoFrameGesture()) {
    return false;
  }
  if (beginUiButtonPress()) {
    return false;
  }

  if (beginHomeGalleryGesture()) {
    return false;
  }

  beginTextPathGesture();

  return false;
}

function touchMoved() {
  setUiPointer();
  setUiPointerActive(1);
  if (updatePhotoFrameGesture()) {
    return false;
  }
  if (updateUiButtonPress()) {
    return false;
  }

  if (updateHomeGalleryGesture()) {
    return false;
  }

  updateTextPathGesture();

  return false;
}

function touchEnded() {
  setUiPointer();
  setUiPointerActive(0);
  if (endPhotoFrameGesture()) {
    return false;
  }
  if (endUiButtonPress()) {
    return false;
  }
  if (endHomeGalleryGesture()) {
    return false;
  }
  endTextPathGesture();
  return false;
}
