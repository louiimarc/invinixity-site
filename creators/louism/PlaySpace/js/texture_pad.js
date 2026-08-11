function texturePadLayout() {
  let state = scene.ui.texturePad;
  let scale = scene.ui.scale;
  let padding = scene.ui.button.padding * scale;
  let panelPadding = 18 * scale;
  let bottomPadding = panelPadding;
  let headerHeight = 72 * scale;
  let sliderHeight = 48 * scale;
  let sliderGap = 10 * scale;
  let sliderSectionGap = 18 * scale;
  let sliderRegionHeight =
    sliderSectionGap + sliderHeight * 3 + sliderGap * 2;
  let compact = width < 700 * scale;
  let maximumPadWidth = width - padding * 2 - panelPadding * 2;
  let maximumPadHeight =
    height - padding * 2 - headerHeight - bottomPadding - sliderRegionHeight;
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
    1.25,
  );
  let middleReveal = constrain(state.progress, 0, 1);
  let sliderReveal = constrain(state.progress - 1, 0, 1);
  state.resize = lerp(1, maximumResize, sliderReveal);
  let padSize = basePadSize * state.resize;
  if (state.titleWidthScale != scale) {
    push();
    textFont(scene.font);
    textSize(44 * scale);
    state.titleWidth = textWidth("Options");
    state.titleWidthScale = scale;
    pop();
  }
  let compactPanelWidth = state.titleWidth + panelPadding * 2;
  let expandedPanelWidth = padSize + panelPadding * 2;
  let panelWidth = lerp(
    compactPanelWidth,
    expandedPanelWidth,
    middleReveal,
  );
  let panelHeight =
    headerHeight +
    (padSize + bottomPadding) * middleReveal +
    sliderRegionHeight * sliderReveal;
  let rightVisibleX = width / 2 - padding - panelWidth / 2;
  let leftVisibleX = -width / 2 + padding + panelWidth / 2;
  let rightHiddenX = width / 2 + padding + panelWidth / 2;
  let leftHiddenX = -width / 2 - padding - panelWidth / 2;
  let sideMix = controlSideMix();
  let visibleX = lerp(leftVisibleX, rightVisibleX, sideMix);
  let hiddenX = lerp(leftHiddenX, rightHiddenX, sideMix);
  let panelX = lerp(hiddenX, visibleX, state.position);
  let visibleY = 0;
  let panelTop = visibleY - panelHeight / 2;
  let panelBottom = visibleY + panelHeight / 2;
  let panelLeft = panelX - panelWidth / 2;
  let panelRight = panelX + panelWidth / 2;
  let padY = panelTop + headerHeight + padSize / 2;
  let sliderTop =
    padY + padSize / 2 + sliderSectionGap + sliderHeight / 2;
  let panelRadius = scene.ui.button.radius * scale;
  let padRadius = max(6 * scale, panelRadius - panelPadding);
  let safeSliderWidth = max(1, panelWidth - panelRadius * 2);
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
      x: lerp(panelRight, panelLeft, sideMix),
      y: panelBottom,
      w: handleReach * 1.6,
      h: handleReach * 1.6,
    },
    sliders: {
      top: sliderTop,
      safeWidth: safeSliderWidth,
      fullWidth: padSize,
      height: sliderHeight,
      gap: sliderGap,
      reveal: sliderReveal,
    },
    middleReveal,
    basePadSize,
    maximumResize,
    compact,
  };
}

function updateOptionsWorkspaceLayout() {
  let state = scene.ui.texturePad;
  if (!state.resizing) {
    state.progress = animateData(state.progress, state.detent, 0.25);
  }

  let nextWidth = texturePadLayout().panelWidth;
  let previousWidth = scene.composition.controlPanelWidth;
  if (!Number.isFinite(previousWidth)) {
    scene.composition.controlPanelWidth = nextWidth;
    return;
  }
  if (abs(previousWidth - nextWidth) < 0.001) return;

  if (scene.session.mode == "active" && scene.text.edit) {
    let sideMix = controlSideMix();
    let from = compositionBounds(
      width,
      height,
      scene.ui.controlSide,
      true,
      sideMix,
      previousWidth,
    );
    let to = compositionBounds(
      width,
      height,
      scene.ui.controlSide,
      true,
      sideMix,
      nextWidth,
    );
    remapArtworkBetweenBounds(from, to);
  }
  scene.composition.controlPanelWidth = nextWidth;
}

function texturePadTargetAtPointer() {
  let bounds = scene.ui.texturePad.bounds;
  if (!scene.text.edit || bounds == null) {
    return null;
  }
  if (pointerInsideBounds(bounds.resize)) return "texturePadResize";
  if (pointerInsideBounds(bounds.title)) return "texturePanelCycle";
  for (let channel of ["red", "green", "blue"]) {
    if (
      bounds.rgbVisible &&
      pointerInsideBounds(scene.gui[channel].bounds)
    ) {
      return channel;
    }
  }
  if (
    bounds.padVisible &&
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
    state.resizeMoved = false;
    state.resizeStartX = mouseX;
    state.resizeStartY = mouseY;
    state.resizeStartProgress = state.progress;
    return true;
  }
  if (target == "texturePanelCycle") return true;
  if (["red", "green", "blue"].includes(target)) {
    scene.ui.slider.active = target;
    let value = horizontalSliderValueFromPointer(scene.gui[target].bounds);
    setTextRgbValue(target, value);
    inout.audio.ui?.slide(target, value, mouseX / width);
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
    let horizontalMovement = controlsOnRight()
      ? state.resizeStartX - mouseX
      : mouseX - state.resizeStartX;
    let verticalMovement = mouseY - state.resizeStartY;
    let movement = (horizontalMovement + verticalMovement) * 0.5;
    state.resizeMoved = state.resizeMoved ||
      abs(horizontalMovement) + abs(verticalMovement) > 6 * scene.ui.scale;
    state.progress = constrain(
      state.resizeStartProgress + movement / (layout.basePadSize * 0.4),
      0,
      2,
    );
    inout.audio.ui?.slide(
      "texturePadResize",
      state.progress / 2,
      mouseX / width,
    );
    return true;
  }
  if (target == "texturePanelCycle") return true;
  if (["red", "green", "blue"].includes(scene.ui.slider.active)) {
    let channel = scene.ui.slider.active;
    let value = horizontalSliderValueFromPointer(scene.gui[channel].bounds);
    setTextRgbValue(channel, value);
    inout.audio.ui?.slide(channel, value, mouseX / width);
    return true;
  }
  if (target != "texturePad" || !scene.ui.texturePad.active) return false;
  updateTexturePadFromPointer();
  return true;
}

function endTexturePadInteraction(target) {
  if (target == "texturePadResize") {
    let state = scene.ui.texturePad;
    let previousDetent = state.detent;
    state.detent = state.resizeMoved
      ? round(state.progress)
      : (state.detent + 1) % 3;
    state.resizing = false;
    inout.audio.ui?.panelSnap(
      previousDetent,
      state.detent,
      mouseX / width,
    );
    return true;
  }
  if (target == "texturePanelCycle") {
    let state = scene.ui.texturePad;
    if (
      state.bounds != null &&
      pointerInsideBounds(state.bounds.title)
    ) {
      let previousDetent = state.detent;
      state.detent = (state.detent + 1) % 3;
      inout.audio.ui?.panelSnap(
        previousDetent,
        state.detent,
        mouseX / width,
      );
    }
    return true;
  }
  if (["red", "green", "blue"].includes(target)) return true;
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
  let panelBottom = layout.y + layout.panelHeight / 2;
  let panelLeft = layout.x - layout.panelWidth / 2;
  let panelRight = layout.x + layout.panelWidth / 2;

  push();
  resetShader();
  translate(0, 0, 32);
  noStroke();
  fill(255, 255 * opacity);
  textFont(scene.font);
  let sideMix = controlSideMix();
  textAlign(sideMix < 0.5 ? LEFT : RIGHT, CENTER);
  textSize(44 * scale);
  text(
    "Options",
    lerp(panelLeft + layout.panelPadding, panelRight - layout.panelPadding, sideMix),
    panelTop + layout.headerHeight * 0.5 - 6 * scale,
  );

  noFill();
  stroke(255, 220 * opacity);
  strokeWeight(5 * scale);
  strokeCap(ROUND);
  let handleRadius = layout.panelRadius;
  let handleOffset = 9 * scale;
  arc(
    controlsOnRight()
      ? panelLeft + layout.panelRadius - handleOffset
      : panelRight - layout.panelRadius + handleOffset,
    panelBottom - layout.panelRadius + handleOffset,
    handleRadius * 2,
    handleRadius * 2,
    controlsOnRight() ? 90 : 0,
    controlsOnRight() ? 180 : 90,
  );
  pop();
}

function drawTexturePadSliders(layout, color) {
  if (layout.sliders.reveal <= 0.001) {
    for (let channel of ["red", "green", "blue"]) {
      scene.gui[channel].bounds = null;
    }
    return;
  }

  let rgb = hsvToRgbValues(color);
  let sliders = [
    {
      channel: "red",
      value: rgb[0],
      start: [0, rgb[1], rgb[2]],
      end: [1, rgb[1], rgb[2]],
    },
    {
      channel: "green",
      value: rgb[1],
      start: [rgb[0], 0, rgb[2]],
      end: [rgb[0], 1, rgb[2]],
    },
    {
      channel: "blue",
      value: rgb[2],
      start: [rgb[0], rgb[1], 0],
      end: [rgb[0], rgb[1], 1],
    },
  ];
  let clipState = beginColorPanelClip({
    x: layout.x,
    y: layout.y,
    w: layout.panelWidth,
    h: layout.panelHeight,
  });

  for (let i = 0; i < sliders.length; i++) {
    let slider = sliders[i];
    let sliderY = layout.sliders.top +
      i * (layout.sliders.height + layout.sliders.gap);
    let panelBottom = layout.y + layout.panelHeight / 2;
    let sliderTopEdge = sliderY - layout.sliders.height / 2;
    let individualReveal = constrain(
      (panelBottom - sliderTopEdge) / layout.sliders.height,
      0,
      1,
    );
    let sliderExtension = constrain(
      (individualReveal - 0.75) / 0.25,
      0,
      1,
    );
    sliderExtension = sliderExtension * sliderExtension *
      (3 - 2 * sliderExtension);
    let sliderWidth = lerp(
      layout.sliders.safeWidth,
      layout.sliders.fullWidth,
      sliderExtension,
    );
    let gui = scene.gui[slider.channel];
    gui.armed = scene.ui.pointer.pressTarget == slider.channel;
    gui.update(scene.elapsedTime, uiPointer(), uiPointerActive());
    push();
    translate(0, 0, 64);
    gui.gradientSlider(
      layout.x,
      sliderY,
      sliderWidth,
      layout.sliders.height,
      layout.sliders.height / 2,
      slider.value,
      slider.start,
      slider.end,
    );
    pop();
    if (individualReveal < 0.99) gui.bounds = null;
  }
  endColorPanelClip(clipState);
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
    title: {
      x: layout.x,
      y:
        layout.y - layout.panelHeight / 2 +
        layout.headerHeight / 2,
      w: layout.panelWidth,
      h: layout.headerHeight,
    },
    pad: {
      x: layout.pad.x,
      y: layout.pad.y,
      w: layout.pad.size,
      h: layout.pad.size,
    },
    resize: layout.handle,
    padVisible: layout.middleReveal >= 0.99,
    rgbVisible: layout.sliders.reveal >= 0.99,
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
  let contentClip = beginColorPanelClip(state.bounds.panel);
  drawTexturePadDots(
    layout,
    state.previewMix || textureMixForWordIndex(scene.text.activeWord),
    opacity * layout.middleReveal,
  );
  endColorPanelClip(contentClip);
  drawTexturePadSliders(layout, scene.ui.colorPanel.color);
}
