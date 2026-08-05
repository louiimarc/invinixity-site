function texturePadLayout() {
  let state = scene.ui.texturePad;
  let scale = scene.ui.scale;
  let padding = scene.ui.button.padding * scale;
  let panelPadding = 18 * scale;
  let bottomPadding = panelPadding;
  let headerHeight = 72 * scale;
  let compact = width < 700 * scale;
  let maximumPadWidth = width - padding * 2 - panelPadding * 2;
  let maximumPadHeight =
    height - padding * 2 - headerHeight - bottomPadding;
  let availablePadSize = max(
    64 * scale,
    min(maximumPadWidth, maximumPadHeight),
  );
  let basePadSize = min(
    280 * scale,
    max(128 * scale, width * 0.3),
    availablePadSize,
  );
  let maximumResize = constrain(
    min(maximumPadWidth, maximumPadHeight) / max(1, basePadSize),
    1,
    1.5,
  );
  state.resize = constrain(state.resize, 1, maximumResize);
  let padSize = basePadSize * state.resize;
  let panelWidth = padSize + panelPadding * 2;
  let panelHeight = headerHeight + padSize + bottomPadding;
  let visibleX = width / 2 - padding - panelWidth / 2;
  let hiddenX = width / 2 + padding + panelWidth / 2;
  let panelX = lerp(hiddenX, visibleX, state.position);
  let visibleY = height / 2 - padding - panelHeight / 2;
  let panelTop = visibleY - panelHeight / 2;
  let panelLeft = panelX - panelWidth / 2;
  let padY = panelTop + headerHeight + padSize / 2;
  let panelRadius = scene.ui.button.radius * scale;
  let padRadius = max(6 * scale, panelRadius - panelPadding);
  let handleReach = panelRadius + 18 * scale;
  return {
    x: panelX,
    y: visibleY,
    size: panelWidth,
    panelWidth,
    panelHeight,
    panelRadius,
    panelPadding,
    bottomPadding,
    headerHeight,
    pad: {
      x: panelX,
      y: padY,
      size: padSize,
      radius: padRadius,
      padding: 24 * scale,
    },
    handle: {
      x: panelLeft,
      y: panelTop,
      w: handleReach * 1.6,
      h: handleReach * 1.6,
    },
    basePadSize,
    maximumResize,
    compact,
  };
}

function texturePadTargetAtPointer() {
  let bounds = scene.ui.texturePad.bounds;
  if (!scene.text.edit || bounds == null) {
    return null;
  }
  if (pointerInsideBounds(bounds.resize)) return "texturePadResize";
  if (
    scene.text.activeWord >= 0 &&
    pointerInsideBounds(bounds.pad)
  ) {
    return "texturePad";
  }
  return pointerInsideBounds(bounds.panel) ? "texturePanel" : null;
}

function updateTexturePadFromPointer() {
  let bounds = scene.ui.texturePad.bounds?.pad;
  if (bounds == null || scene.text.activeWord < 0) return;
  let pointerX = mouseX - width / 2;
  let pointerY = mouseY - height / 2;
  let x = constrain(
    (pointerX - (bounds.x - bounds.w / 2)) / bounds.w,
    0,
    1,
  );
  let y = constrain(
    (pointerY - (bounds.y - bounds.h / 2)) / bounds.h,
    0,
    1,
  );
  scene.ui.texturePad.previewMix = { x, y };
  setTextureMixForSelectedWords(x, y);
  inout.audio.ui?.xyPad("texturePad", x, y, mouseX / width);
}

function beginTexturePadInteraction(target) {
  if (target == "texturePadResize") {
    let state = scene.ui.texturePad;
    state.resizing = true;
    state.resizeStartX = mouseX;
    state.resizeStartY = mouseY;
    state.resizeStartValue = state.resize;
    return true;
  }
  if (target == "texturePanel") return true;
  if (target != "texturePad") return false;
  scene.ui.texturePad.active = true;
  updateTexturePadFromPointer();
  return true;
}

function updateTexturePadInteraction(target) {
  if (target == "texturePadResize" && scene.ui.texturePad.resizing) {
    let state = scene.ui.texturePad;
    let layout = texturePadLayout();
    let horizontalMovement = state.resizeStartX - mouseX;
    let verticalMovement = state.resizeStartY - mouseY;
    let movement = (horizontalMovement + verticalMovement) * 0.5;
    state.resize = constrain(
      state.resizeStartValue + movement / layout.basePadSize,
      1,
      layout.maximumResize,
    );
    inout.audio.ui?.slide(
      "texturePadResize",
      map(state.resize, 1, 1.5, 0, 1),
      mouseX / width,
    );
    return true;
  }
  if (target != "texturePad" || !scene.ui.texturePad.active) return false;
  updateTexturePadFromPointer();
  return true;
}

function endTexturePadInteraction(target) {
  if (target == "texturePadResize") {
    scene.ui.texturePad.resizing = false;
    return true;
  }
  if (target == "texturePanel") return true;
  if (target != "texturePad") return false;
  scene.ui.texturePad.active = false;
  scene.ui.texturePad.previewMix = null;
  saveTextMemory();
  return true;
}

function drawTexturePadDots(layout, mix, opacity) {
  let columns = 9;
  let rows = 9;
  let innerSize = layout.pad.size - layout.pad.padding * 2;
  let points = [];
  let minimumDistance = Infinity;
  for (let column = 0; column < columns; column++) {
    for (let row = 0; row < rows; row++) {
      let x = column / (columns - 1);
      let y = row / (rows - 1);
      let distance = sqrt(
        (x - mix.x) * (x - mix.x) +
        (y - mix.y) * (y - mix.y),
      );
      points.push({ x, y, distance });
      minimumDistance = min(minimumDistance, distance);
    }
  }

  push();
  resetShader();
  translate(0, 0, 32);
  noStroke();
  fill(255, 220 * opacity);
  let baseDiameter = 6 * scene.ui.scale;
  for (let i = 0; i < points.length; i++) {
    let point = points[i];
    let adjustedDistance = max(0, point.distance - minimumDistance);
    let influence = pow(1 - constrain(adjustedDistance / 0.35, 0, 1), 2);
    let targetScale = 1 + influence * 2;
    let currentScale = scene.ui.texturePad.dotScales[i] ?? 1;
    currentScale = animateData(currentScale, targetScale, 0.4);
    scene.ui.texturePad.dotScales[i] = currentScale;
    let diameter = baseDiameter * currentScale;
    circle(
      layout.x - innerSize / 2 + point.x * innerSize,
      layout.pad.y - innerSize / 2 + point.y * innerSize,
      diameter,
    );
  }
  pop();
}

function drawTexturePadPanelDetails(layout, opacity) {
  let scale = scene.ui.scale;
  let panelTop = layout.y - layout.panelHeight / 2;
  let panelLeft = layout.x - layout.panelWidth / 2;

  push();
  resetShader();
  translate(0, 0, 32);
  noStroke();
  fill(255, 255 * opacity);
  textFont(scene.font);
  textAlign(RIGHT, CENTER);
  textSize(44 * scale);
  text(
    "Texture",
    layout.x + layout.panelWidth / 2 - layout.panelPadding,
    panelTop + layout.headerHeight * 0.5 - 6 * scale,
  );

  noFill();
  stroke(255, 220 * opacity);
  strokeWeight(5 * scale);
  strokeCap(ROUND);
  let handleRadius = layout.panelRadius;
  let handleOffset = 9 * scale;
  arc(
    panelLeft + layout.panelRadius - handleOffset,
    panelTop + layout.panelRadius - handleOffset,
    handleRadius * 2,
    handleRadius * 2,
    180,
    270,
  );
  pop();
}

function drawTexturePad() {
  let visible =
    scene.session.mode == "active" && scene.text.edit && data.loading.ready;
  let state = scene.ui.texturePad;
  state.position = animateData(state.position, visible ? 1 : 0, 0.25);
  if (!visible && state.position < 0.001) {
    state.bounds = null;
    return;
  }

  let layout = texturePadLayout();
  state.bounds = {
    panel: {
      x: layout.x,
      y: layout.y,
      w: layout.panelWidth,
      h: layout.panelHeight,
    },
    pad: {
      x: layout.pad.x,
      y: layout.pad.y,
      w: layout.pad.size,
      h: layout.pad.size,
    },
    resize: layout.handle,
  };
  let opacity = constrain(state.position, 0, 1);
  scene.gui.texturePanel.update(
    scene.elapsedTime,
    uiPointer(),
    uiPointerActive(),
  );
  let panelTop = layout.y - layout.panelHeight / 2;
  scene.gui.texturePanel.gradientPanel(
    layout.x,
    layout.y,
    layout.panelWidth,
    layout.panelHeight,
    layout.panelRadius,
    [0.5, (layout.pad.y - panelTop) / layout.panelHeight],
    [
      layout.pad.size / layout.panelWidth,
      layout.pad.size / layout.panelHeight,
    ],
    layout.pad.radius / (layout.pad.size * 0.5),
  );
  drawTexturePadPanelDetails(layout, opacity);
  drawTexturePadDots(
    layout,
    state.previewMix || textureMixForWordIndex(scene.text.activeWord),
    opacity,
  );
}
