const PLAYSPACE_FLOW_SLICE_PATHS = {
  play: "assets/ui/buttons/play.svg",
  capture: "assets/ui/buttons/capture.svg",
  cancel: "assets/ui/buttons/cancel.svg",
  retake: "assets/ui/buttons/retake.svg",
  next: "assets/ui/buttons/next.svg",
  nextGreen: "assets/ui/buttons/next_green.svg",
  redraw: "assets/ui/buttons/redraw.svg",
  undo: "assets/ui/buttons/undo.svg",
  redo: "assets/ui/buttons/redo.svg",
  delete: "assets/ui/buttons/delete.svg",
  edit: "assets/ui/buttons/edit.svg",
  finish: "assets/ui/buttons/finish.svg",
  finishTeal: "assets/ui/buttons/finish_teal.svg",
  finishFinal: "assets/ui/buttons/finish_final.svg",
  yes: "assets/ui/buttons/yes.svg",
  exitDark: "assets/ui/buttons/exit_dark.svg",
  exitLight: "assets/ui/buttons/exit_light.svg",
  popup: "assets/ui/containers/popup.svg",
  timer: "assets/ui/containers/timer.svg",
  timerPhoto: "assets/ui/containers/timer_photo.svg",
  drawCursor: "assets/ui/icons/draw_cursor.png",
  layerActive: "assets/ui/containers/layers_active.svg",
  layerIdle: "assets/ui/containers/layers_idle.svg",
  layerLocked: "assets/ui/containers/layers_locked.svg",
};

const PLAYSPACE_FLOW_BACKGROUND_PATHS = [
  "assets/examples/fallback/card_01.svg",
  "assets/examples/fallback/card_02.svg",
  "assets/examples/fallback/card_03.svg",
  "assets/examples/fallback/card_04.svg",
  "assets/examples/fallback/card_05.svg",
  "assets/examples/fallback/card_06.svg",
];

const PLAYSPACE_CARD_BACK_BACKGROUND_PATHS = [
  "assets/poster/back/backgrounds/background_01.jpg",
  "assets/poster/back/backgrounds/background_02.jpg",
  "assets/poster/back/backgrounds/background_03.jpg",
  "assets/poster/back/backgrounds/background_04.jpg",
  "assets/poster/back/backgrounds/background_05.jpg",
  "assets/poster/back/backgrounds/background_06.jpg",
];

const PLAYSPACE_CARD_BACK_PATH = "assets/poster/back/card_back_side.png";
const PLAYSPACE_BACKGROUND_DIM_ALPHA = 255 * 0.05;
const PLAYSPACE_PALETTE_TO_BACKGROUND = [5, 1, 2, 4, 0, 3];

scene.flowUi = {
  slices: Object.create(null),
  backgrounds: [],
  exportBackgrounds: [],
  cardBackBackgrounds: [],
  cardBack: null,
  cardBackLight: null,
  cardBackLightUrl: "",
};

function lightCardBackArtwork(source) {
  let artwork = source.get();
  artwork.loadPixels();
  for (let index = 0; index < artwork.pixels.length; index += 4) {
    let alpha = artwork.pixels[index + 3];
    if (alpha <= 0) continue;
    let red = artwork.pixels[index];
    let green = artwork.pixels[index + 1];
    let blue = artwork.pixels[index + 2];
    let maximum = max(red, green, blue);
    let minimum = min(red, green, blue);
    let saturation = maximum <= 0 ? 0 : (maximum - minimum) / maximum;
    if (saturation > 0.2) continue;
    artwork.pixels[index] = 255;
    artwork.pixels[index + 1] = 255;
    artwork.pixels[index + 2] = 255;
  }
  artwork.updatePixels();
  return artwork;
}

scene.ui.backgroundPicker = {
  open: false,
  finalizing: false,
  capturePending: false,
  selectedIndex: 0,
  itemBounds: [],
  cardSnapshot: null,
  position: 0,
  targetPosition: 0,
  slotSpacing: 1,
  drag: {
    active: false,
    moved: false,
    startX: 0,
    startPosition: 0,
    lastX: 0,
    lastTime: 0,
    velocity: 0,
  },
};

function preloadFlowUiAssets() {
  let entries = Object.entries(PLAYSPACE_FLOW_SLICE_PATHS);
  data.amount += entries.length + PLAYSPACE_FLOW_BACKGROUND_PATHS.length * 2 +
    PLAYSPACE_CARD_BACK_BACKGROUND_PATHS.length + 1;
  for (let [key, path] of entries) {
    scene.flowUi.slices[key] = loadImage(
      path,
      loaded,
      (error) => {
        console.warn(`Unable to load flow slice ${path}`, error);
        loaded();
      },
    );
  }
  scene.flowUi.backgrounds = PLAYSPACE_FLOW_BACKGROUND_PATHS.map((path) =>
    loadImage(
      path,
      loaded,
      (error) => {
        console.warn(`Unable to load background frame ${path}`, error);
        loaded();
      },
    )
  );
  scene.flowUi.exportBackgrounds = PLAYSPACE_FLOW_BACKGROUND_PATHS.map(
    (path) => {
      let asset = new window.Image();
      asset.onload = loaded;
      asset.onerror = (error) => {
        console.warn(`Unable to load export background frame ${path}`, error);
        loaded();
      };
      asset.src = path;
      return asset;
    },
  );
  scene.flowUi.cardBackBackgrounds = PLAYSPACE_CARD_BACK_BACKGROUND_PATHS.map(
    (path) =>
      loadImage(
        path,
        loaded,
        (error) => {
          console.warn(`Unable to load card back background ${path}`, error);
          loaded();
        },
      ),
  );
  scene.flowUi.cardBack = loadImage(
    PLAYSPACE_CARD_BACK_PATH,
    (asset) => {
      asset.resize(scene.composition.width, scene.composition.height);
      scene.flowUi.cardBackLight = lightCardBackArtwork(asset);
      scene.flowUi.cardBackLightUrl = "";
      loaded();
    },
    (error) => {
      console.warn(
        `Unable to load card back ${PLAYSPACE_CARD_BACK_PATH}`,
        error,
      );
      loaded();
    },
  );
}

function flowSliceSize(key, maximumWidth, maximumHeight) {
  let asset = scene.flowUi.slices[key];
  if (asset == null || asset.width <= 1 || asset.height <= 1) {
    return { width: maximumWidth, height: maximumHeight };
  }
  let scale = min(maximumWidth / asset.width, maximumHeight / asset.height);
  return { width: asset.width * scale, height: asset.height * scale };
}

function drawFlowSliceButton(gui, key, x, y, maximumWidth, maximumHeight) {
  let asset = scene.flowUi.slices[key];
  let size = flowSliceSize(key, maximumWidth, maximumHeight);
  let pressed = gui?.armed === true;
  let pressScale = pressed ? 0.96 : 1;
  let drawY = y + (pressed ? 4 * scene.ui.scale : 0);
  if (gui != null) {
    gui.bounds = { x, y: drawY, w: size.width, h: size.height };
  }
  if (asset == null || asset.width <= 1 || asset.height <= 1) return;

  push();
  resetShader();
  imageMode(CENTER);
  translate(x, drawY);
  scale(pressScale);
  image(asset, 0, 0, size.width, size.height);
  pop();
}

function drawFlowHeading(title, subtitle, y, rgb = [255, 255, 255]) {
  push();
  resetShader();
  textAlign(CENTER, CENTER);
  textFont(scene.text.font || scene.font);
  fill(...rgb);
  textSize(28 * scene.ui.scale);
  text(title, 0, y);
  if (subtitle != "") {
    textFont(scene.text.font || scene.font);
    textSize(16 * scene.ui.scale);
    text(subtitle, 0, y + 34 * scene.ui.scale);
  }
  pop();
}

function drawEditorSessionChrome() {
  if (
    scene.session.mode != "active" ||
    scene.ui.backgroundPicker.open ||
    scene.ui.printPreview.open
  ) {
    scene.gui.frameExit.bounds = null;
    scene.gui.editorUndo.bounds = null;
    scene.gui.editorRedo.bounds = null;
    scene.gui.editorDelete.bounds = null;
    return;
  }
  if (
    scene.text.edit &&
    scene.ui.editorHistory.past.length == 0
  ) {
    recordEditorHistory();
  }

  let scale = scene.ui.scale;
  let padding = scene.ui.button.padding * scale;
  let poster = compositionBounds();
  let uiRgb = sessionPhotoFrameUiRgb();
  let headerY = uiSafeTopY(padding + 48 * scale);
  let exitWidth = min(poster.width * 0.2, 120 * scale);
  let exitHeight = exitWidth * 171 / 242;

  push();
  resetMatrix();
  ortho();
  resetShader();
  translate(0, 0, scene.layer.ui + 192);
  _renderer.GL.clear(_renderer.GL.DEPTH_BUFFER_BIT);

  scene.gui.frameExit.armed = scene.ui.pointer.pressTarget == "frameExit";
  drawFlowSliceButton(
    scene.gui.frameExit,
    uiRgb[0] < 128 ? "exitDark" : "exitLight",
    -width / 2 + scene.ui.safeArea.left + padding + exitWidth / 2,
    headerY,
    exitWidth,
    exitHeight,
  );

  let timerAsset = scene.flowUi.slices.timer;
  let timerWidth = min(poster.width * 0.25, 150 * scale);
  let timerHeight = timerWidth * 251 / 469;
  let timerX = width / 2 - scene.ui.safeArea.right - padding - timerWidth / 2;
  if (timerAsset?.width > 1) {
    imageMode(CENTER);
    image(timerAsset, timerX, headerY, timerWidth, timerHeight);
    fill(25);
    textFont(scene.text.font);
    textAlign(CENTER, CENTER);
    textSize(timerHeight * 0.48);
    text(
      sessionPhotoFrameTimerLabel(),
      timerX,
      headerY - timerHeight * 0.04,
    );
  }

  if (scene.text.edit) {
    let actionY = headerY + max(exitHeight, timerHeight) * 0.92;
    let actionHeight = 54 * scale;
    let actionWidth = 126 * scale;
    let actionGap = 22 * scale;
    let actions = [
      [scene.gui.editorUndo, "undo", "editorUndo"],
      [scene.gui.editorRedo, "redo", "editorRedo"],
      [scene.gui.editorDelete, "delete", "editorDelete"],
    ];
    let totalWidth =
      actions.length * actionWidth + (actions.length - 1) * actionGap;
    for (let index = 0; index < actions.length; index++) {
      let [gui, assetKey, target] = actions[index];
      gui.armed = scene.ui.pointer.pressTarget == target;
      drawFlowSliceButton(
        gui,
        assetKey,
        -totalWidth / 2 + actionWidth / 2 +
          index * (actionWidth + actionGap),
        actionY,
        actionWidth,
        actionHeight,
      );
    }
  } else {
    scene.gui.editorUndo.bounds = null;
    scene.gui.editorRedo.bounds = null;
    scene.gui.editorDelete.bounds = null;
  }

  drawCameraExitConfirmation(scene.session.cameraPrompt);
  pop();
}

function drawSelectedFlowBackground(target = scene.workspace) {
  let index = scene.session.backgroundFrameIndex;
  if (!Number.isInteger(index)) return;
  let asset = scene.flowUi.backgrounds[index];
  if (asset == null || asset.width <= 1 || asset.height <= 1) return;
  let bounds = compositionBounds();
  target.push();
  target.resetShader();
  target.imageMode(CENTER);
  target.image(
    asset,
    bounds.x + bounds.width / 2 - width / 2,
    bounds.y + bounds.height / 2 - height / 2,
    bounds.width,
    bounds.height,
  );
  target.translate(0, 0, scene.layer.background + 16);
  target.rectMode(CORNER);
  target.noStroke();
  target.fill(0, PLAYSPACE_BACKGROUND_DIM_ALPHA);
  target.rect(
    bounds.x - width / 2,
    bounds.y - height / 2,
    bounds.width,
    bounds.height,
  );
  target.pop();
}

function drawSelectedFlowCreationCard(target = scene.workspace) {
  if (!Number.isInteger(scene.session.backgroundFrameIndex)) return;
  let bounds = creationCardBounds();
  let rgb = sessionBackgroundRgb();
  target.push();
  target.resetShader();
  target.translate(0, 0, scene.layer.background + 32);
  target.rectMode(CORNER);
  target.noStroke();
  target.fill(rgb[0] * 255, rgb[1] * 255, rgb[2] * 255);
  target.rect(
    bounds.x - width / 2,
    bounds.y - height / 2,
    bounds.width,
    bounds.height,
    creationCardCornerRadius(bounds),
  );
  target.pop();
}

function backgroundFrameIndexForPalette(paletteIndex) {
  return PLAYSPACE_PALETTE_TO_BACKGROUND[paletteIndex] ?? 0;
}

function paletteIndexForBackgroundFrame(backgroundIndex) {
  let index = wrappedBackgroundFrameIndex(backgroundIndex);
  let paletteIndex = PLAYSPACE_PALETTE_TO_BACKGROUND.indexOf(index);
  return paletteIndex < 0 ? 0 : paletteIndex;
}

function cardBackForegroundTarget(backgroundIndex) {
  return frameOverlayForegroundTargetForPaletteIndex(
    paletteIndexForBackgroundFrame(backgroundIndex),
  );
}

function cardBackArtworkForBackground(backgroundIndex) {
  return cardBackForegroundTarget(backgroundIndex) > 0.5
    ? scene.flowUi.cardBackLight || scene.flowUi.cardBack
    : scene.flowUi.cardBack;
}

function cardBackArtworkUrlForBackground(backgroundIndex) {
  let artwork = cardBackArtworkForBackground(backgroundIndex);
  if (artwork == null || artwork == scene.flowUi.cardBack) {
    return PLAYSPACE_CARD_BACK_PATH;
  }
  if (scene.flowUi.cardBackLightUrl == "") {
    try {
      scene.flowUi.cardBackLightUrl = artwork.canvas.toDataURL("image/png");
    } catch (error) {
      console.warn("Unable to prepare light card-back artwork", error);
      return PLAYSPACE_CARD_BACK_PATH;
    }
  }
  return scene.flowUi.cardBackLightUrl;
}

function wrappedBackgroundFrameIndex(index) {
  let count = scene.flowUi.backgrounds.length;
  if (count <= 0) return 0;
  return ((round(index) % count) + count) % count;
}

function nearestBackgroundFramePosition(index, position) {
  let count = scene.flowUi.backgrounds.length;
  if (count <= 0) return 0;
  return index + round((position - index) / count) * count;
}

function captureBackgroundPickerCard() {
  let state = scene.ui.backgroundPicker;
  let posterSnapshot = cardPreviewSnapshot(scene.workspace);
  let cardWidth = posterSnapshot.width * scene.creationCard.widthRatio;
  let cardHeight = cardWidth * scene.creationCard.height /
    scene.creationCard.width;
  let rawSnapshot = posterSnapshot.get(
    round((posterSnapshot.width - cardWidth) / 2),
    round((posterSnapshot.height - cardHeight) / 2),
    max(1, round(cardWidth)),
    max(1, round(cardHeight)),
  );
  let maximumWidth = 540;
  if (rawSnapshot.width > maximumWidth) {
    rawSnapshot.resize(
      maximumWidth,
      round(
        maximumWidth * scene.creationCard.height /
          scene.creationCard.width,
      ),
    );
  }
  let roundedBuffer = createGraphics(rawSnapshot.width, rawSnapshot.height);
  roundedBuffer.pixelDensity(1);
  roundedBuffer.clear();
  let context = roundedBuffer.drawingContext;
  let radius = min(rawSnapshot.width, rawSnapshot.height) *
    scene.creationCard.cornerRadius;
  context.save();
  clipPosterExportRoundedRect(
    context,
    {
      x: 0,
      y: 0,
      width: rawSnapshot.width,
      height: rawSnapshot.height,
    },
    radius,
  );
  roundedBuffer.imageMode(CORNER);
  roundedBuffer.image(
    rawSnapshot,
    0,
    0,
    rawSnapshot.width,
    rawSnapshot.height,
  );
  context.restore();
  let snapshot = roundedBuffer.get();
  roundedBuffer.remove();
  state.cardSnapshot = snapshot;
}

function openBackgroundFramePicker() {
  let state = scene.ui.backgroundPicker;
  if (
    scene.session.mode != "active" ||
    state.open ||
    state.finalizing ||
    scene.ui.printPreview.pending ||
    scene.ui.printPreview.open ||
    (typeof downloadHandoff != "undefined" &&
      downloadHandoff.stage != "closed")
  ) return false;

  state.open = true;
  state.finalizing = false;
  let paletteIndex = scene.ui.colorPanel.selectedPaletteIndex ??
    frameOverlayPaletteIndex();
  state.selectedIndex = Number.isInteger(scene.session.backgroundFrameIndex)
    ? scene.session.backgroundFrameIndex
    : backgroundFrameIndexForPalette(paletteIndex);
  state.position = state.selectedIndex;
  state.targetPosition = state.selectedIndex;
  state.drag.active = false;
  state.drag.moved = false;
  state.drag.velocity = 0;
  state.cardSnapshot = null;
  state.capturePending = true;
  scene.ui.pointer.pressTarget = null;
  scene.ui.pointer.pressStartedOnButton = false;
  return true;
}

function closeBackgroundFramePicker(cancelFinalization = true) {
  let state = scene.ui.backgroundPicker;
  state.open = false;
  state.drag.active = false;
  state.drag.moved = false;
  state.drag.velocity = 0;
  state.capturePending = false;
  state.itemBounds = [];
  if (cancelFinalization) state.finalizing = false;
  scene.gui.backgroundCancel.bounds = null;
  scene.gui.backgroundNext.bounds = null;
  scene.ui.pointer.pressTarget = null;
  scene.ui.pointer.pressStartedOnButton = false;
}

function confirmBackgroundFramePicker() {
  let state = scene.ui.backgroundPicker;
  if (
    !state.open ||
    state.finalizing ||
    scene.session.mode != "active" ||
    scene.ui.printPreview.pending ||
    scene.ui.printPreview.open
  ) return false;

  state.finalizing = true;
  scene.session.photoFrame.timeoutHandled = true;
  scene.session.backgroundFrameIndex = state.selectedIndex;
  saveTextMemory();
  closeBackgroundFramePicker(false);
  if (!requestPrintPreview(true)) {
    state.finalizing = false;
    return false;
  }
  return true;
}

function backgroundFramePickerTargetAtPointer() {
  let state = scene.ui.backgroundPicker;
  if (!state.open) return null;
  if (scene.gui.backgroundCancel.hitTest()) return "backgroundCancel";
  if (scene.gui.backgroundNext.hitTest()) return "backgroundNext";
  let pointerX = mouseX - width / 2;
  let pointerY = mouseY - height / 2;
  for (let bounds of state.itemBounds) {
    if (
      pointerX >= bounds.x - bounds.w / 2 &&
      pointerX <= bounds.x + bounds.w / 2 &&
      pointerY >= bounds.y - bounds.h / 2 &&
      pointerY <= bounds.y + bounds.h / 2
    ) {
      return `backgroundFrame:${bounds.index}`;
    }
  }
  return "backgroundPicker";
}

function beginBackgroundFramePickerGesture() {
  let state = scene.ui.backgroundPicker;
  if (!state.open) return false;
  state.drag.active = true;
  state.drag.moved = false;
  state.drag.startX = mouseX;
  state.drag.startPosition = state.position;
  state.drag.lastX = mouseX;
  state.drag.lastTime = millis();
  state.drag.velocity = 0;
  return true;
}

function updateBackgroundFramePickerGesture() {
  let state = scene.ui.backgroundPicker;
  if (!state.open || !state.drag.active) return false;
  let spacing = max(1, state.slotSpacing);
  let deltaX = mouseX - state.drag.startX;
  state.drag.moved = state.drag.moved || abs(deltaX) > 8 * scene.ui.scale;
  state.position = state.drag.startPosition - deltaX / spacing;
  let now = millis();
  let elapsed = max(1, now - state.drag.lastTime);
  state.drag.velocity = lerp(
    state.drag.velocity,
    -((mouseX - state.drag.lastX) / spacing) * 1000 / elapsed,
    0.4,
  );
  state.drag.lastX = mouseX;
  state.drag.lastTime = now;
  return true;
}

function endBackgroundFramePickerGesture(releaseTarget) {
  let state = scene.ui.backgroundPicker;
  if (!state.open || !state.drag.active) return false;
  state.drag.active = false;
  if (!state.drag.moved && releaseTarget?.startsWith("backgroundFrame:")) {
    let index = Number.parseInt(releaseTarget.split(":")[1], 10);
    state.targetPosition = nearestBackgroundFramePosition(
      index,
      state.position,
    );
  } else {
    state.targetPosition = round(
      state.position + constrain(state.drag.velocity * 0.12, -1.25, 1.25),
    );
  }
  state.selectedIndex = wrappedBackgroundFrameIndex(state.targetPosition);
  state.drag.velocity = 0;
  return true;
}

function drawBackgroundFramePreview(
  asset,
  cardSnapshot,
  x,
  y,
  cardWidth,
  cardHeight,
) {
  push();
  imageMode(CENTER);
  image(asset, x, y, cardWidth, cardHeight);
  translate(0, 0, 16);
  rectMode(CENTER);
  noStroke();
  fill(0, PLAYSPACE_BACKGROUND_DIM_ALPHA);
  rect(x, y, cardWidth, cardHeight);
  if (cardSnapshot == null || cardSnapshot.width <= 1) {
    pop();
    return;
  }
  let innerWidth = cardWidth * scene.creationCard.widthRatio;
  let innerHeight = innerWidth * scene.creationCard.height /
    scene.creationCard.width;
  translate(0, 0, 16);
  image(cardSnapshot, x, y, innerWidth, innerHeight);
  pop();
}

function drawBackgroundFramePicker() {
  let state = scene.ui.backgroundPicker;
  if (!state.open) return;
  if (state.capturePending) {
    captureBackgroundPickerCard();
    state.capturePending = false;
  }

  push();
  resetMatrix();
  ortho();
  resetShader();
  translate(0, 0, scene.layer.ui + 256);
  rectMode(CENTER);
  noStroke();
  fill(117, 61, 91);
  rect(0, 0, width, height);

  let headingY = uiSafeTopY(54 * scene.ui.scale);
  drawFlowHeading(
    "Pick a Background Frame",
    "Slide to choose the layer behind your card",
    headingY,
    [255, 255, 255],
  );

  let contentTop = headingY + 72 * scene.ui.scale;
  let contentBottom = uiSafeBottomY(132 * scene.ui.scale);
  let availableHeight = max(100 * scene.ui.scale, contentBottom - contentTop);
  let selectedHeight = min(
    availableHeight,
    height * 0.68,
    width * 1.08,
  );
  let selectedWidth = selectedHeight * 9 / 16;
  let carouselY = (contentTop + contentBottom) / 2;
  let gap = 28 * scene.ui.scale;
  state.slotSpacing = selectedWidth + gap;
  state.itemBounds = [];

  if (!state.drag.active) {
    state.position = animateData(
      state.position,
      state.targetPosition,
      0.16,
    );
  }

  for (let index = 0; index < scene.flowUi.backgrounds.length; index++) {
    let count = scene.flowUi.backgrounds.length;
    let offset = index - state.position;
    while (offset > count / 2) offset -= count;
    while (offset < -count / 2) offset += count;
    let distance = min(1, abs(offset));
    let itemScale = lerp(1, 0.78, distance);
    let cardWidth = selectedWidth * itemScale;
    let cardHeight = selectedHeight * itemScale;
    let x = offset * state.slotSpacing;
    if (x + cardWidth / 2 < -width / 2 || x - cardWidth / 2 > width / 2) {
      continue;
    }
    let y = carouselY;
    let asset = scene.flowUi.backgrounds[index];
    drawBackgroundFramePreview(
      asset,
      state.cardSnapshot,
      x,
      y,
      cardWidth,
      cardHeight,
    );
    state.itemBounds.push({ index, x, y, w: cardWidth, h: cardHeight });
  }

  let buttonY = uiSafeBottomY(70 * scene.ui.scale);
  scene.gui.backgroundCancel.armed = scene.ui.pointer.pressTarget == "backgroundCancel";
  drawFlowSliceButton(
    scene.gui.backgroundCancel,
    "edit",
    -110 * scene.ui.scale,
    buttonY,
    180 * scene.ui.scale,
    72 * scene.ui.scale,
  );
  scene.gui.backgroundNext.armed = scene.ui.pointer.pressTarget == "backgroundNext";
  drawFlowSliceButton(
    scene.gui.backgroundNext,
    "finish",
    110 * scene.ui.scale,
    buttonY,
    180 * scene.ui.scale,
    72 * scene.ui.scale,
  );
  pop();
}
