function layerContentItems() {
  let items = [];
  if (
    scene.session.photo != null &&
    scene.session.photoFrame.closed
  ) {
    items.push({ key: "photo", type: "photo", wordIndex: -1 });
  }
  for (let [wordIndex, entry] of textWordEntries().entries()) {
    items.push({ key: entry.key, type: "word", wordIndex });
  }
  return items;
}

function syncLayerOrder() {
  let items = layerContentItems();
  let validKeys = new Set(items.map((item) => item.key));
  let order = [];
  for (let key of scene.text.layerOrder) {
    if (validKeys.has(key) && !order.includes(key)) order.push(key);
  }
  if (validKeys.has("photo") && !order.includes("photo")) {
    order.unshift("photo");
  }
  for (let item of items) {
    if (!order.includes(item.key)) order.push(item.key);
  }
  scene.text.layerOrder = order;
  if (!validKeys.has(scene.ui.layerBar.selectedKey)) {
    scene.ui.layerBar.selectedKey = null;
  }
  return order;
}

function layerItemForKey(key) {
  return layerContentItems().find((item) => item.key == key) || null;
}

function drawLayeredWorkspaceContent(baseTextSize) {
  let order = syncLayerOrder();
  for (let layerIndex = 0; layerIndex < order.length; layerIndex++) {
    let key = order[layerIndex];
    let item = layerItemForKey(key);
    if (item == null) continue;
    if (item.type == "photo") {
      drawSessionPhoto(layerIndex);
      continue;
    }
    let path = textPathForWordIndex(item.wordIndex);
    if (path == null) continue;
    let word = textWords()[item.wordIndex];
    let textSizeValue = textSizeForWordIndex(item.wordIndex, baseTextSize);
    drawWordOnTextPath(
      word,
      path,
      textSizeValue,
      item.wordIndex,
      layerIndex,
    );
  }
}

function layerPointSegmentDistance(px, py, a, b) {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  let lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0.0001) return dist(px, py, a.x, a.y);
  let t = constrain(
    ((px - a.x) * dx + (py - a.y) * dy) / lengthSquared,
    0,
    1,
  );
  return dist(px, py, a.x + dx * t, a.y + dy * t);
}

function layerWordHit(wordIndex, x, y) {
  let path = textPathForWordIndex(wordIndex);
  if (path == null || path.length < 2) return false;
  let creationCard = creationCardBounds();
  let baseTextSize = min(creationCard.width, creationCard.height) / 4;
  let hitRadius = max(
    24 * scene.ui.scale,
    textSizeForWordIndex(wordIndex, baseTextSize) * 0.32,
  );
  for (let i = 1; i < path.length; i++) {
    if (layerPointSegmentDistance(x, y, path[i - 1], path[i]) <= hitRadius) {
      return true;
    }
  }
  return false;
}

function layerPointInsidePhoto(x, y) {
  let points = scene.session.photoFrame.points;
  if (points.length < 3) return false;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    let a = points[i];
    let b = points[j];
    let crosses =
      a.y > y != b.y > y &&
      x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y || 0.0001) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function layerItemAtCanvasPointer() {
  if (!pointInsideComposition(mouseX, mouseY)) return null;
  let order = syncLayerOrder();
  for (let i = order.length - 1; i >= 0; i--) {
    let item = layerItemForKey(order[i]);
    if (item == null) continue;
    if (item.type == "word" && layerWordHit(item.wordIndex, mouseX, mouseY)) {
      return item;
    }
    if (item.type == "photo" && layerPointInsidePhoto(mouseX, mouseY)) {
      return item;
    }
  }
  return null;
}

function clearCanvasTextSelection() {
  scene.text.activeWord = -1;
  scene.text.pathEditArmed = false;
  clearTextSelectionOverride();
  if (scene.text.input == null) return;
  let caret = constrain(scene.text.cursor.pos, 0, scene.text.buffer.length);
  scene.text.input.blur();
  scene.text.input.setSelectionRange(caret, caret, "forward");
}

function selectCanvasWordForPathEditing(wordIndex) {
  let entry = textWordEntries()[wordIndex];
  if (entry == null) return false;
  scene.text.activeWord = wordIndex;
  scene.text.pathEditArmed = true;
  scene.text.cursor.pos = entry.end;
  scene.text.cursor.preferredColumn = currentColumn();
  scene.text.selectionOverride = {
    start: entry.start,
    end: entry.end,
    direction: "forward",
  };
  if (scene.text.input != null) {
    scene.text.input.blur();
  }
  return true;
}

function selectLayerItemAtCanvasPointer() {
  if (!scene.text.edit || scene.session.mode != "active") return false;
  let item = layerItemAtCanvasPointer();
  if (item == null) {
    scene.ui.layerBar.selectedKey = null;
    clearCanvasTextSelection();
    return false;
  }
  scene.ui.layerBar.selectedKey = item.key;
  if (item.type == "word") {
    selectCanvasWordForPathEditing(item.wordIndex);
  } else {
    clearCanvasTextSelection();
  }
  saveTextMemory();
  inout.audio.ui?.tap("layerSelect", mouseX / width);
  return true;
}

function layerBarLayout() {
  let order = [...syncLayerOrder()].reverse();
  let scale = scene.ui.scale;
  let compactFactor = height < 800 * scale ? 0.64 : 1;
  let optionsLayout = texturePadLayout();
  let lineHeight = 44 * scale * compactFactor;
  let lineGap = 54 * scale * compactFactor;
  let headerHeight = 64 * scale * compactFactor;
  let panelPadding = 18 * scale * compactFactor;
  let availableLineWidth = max(
    44 * scale,
    optionsLayout.panelWidth - panelPadding * 2,
  );
  let normalWidth = availableLineWidth;
  let selectedWidth = availableLineWidth;
  let contentHeight = max(
    lineHeight,
    (order.length - 1) * lineGap + lineHeight,
  );
  let targetPanelWidth = optionsLayout.panelWidth;
  let targetPanelHeight =
    headerHeight + contentHeight + panelPadding * 2;
  let currentPanelHeight = scene.ui.layerBar.panelHeight > 0
    ? scene.ui.layerBar.panelHeight
    : targetPanelHeight;
  let optionsTop = optionsLayout.y - optionsLayout.panelHeight / 2;
  let panelGap = 8 * scale;
  let desiredPanelY =
    optionsTop - panelGap - currentPanelHeight / 2;
  let topLimit = -height / 2 + 138 * scale;
  let panelY = max(
    desiredPanelY,
    topLimit + currentPanelHeight / 2,
  );
  let contentTop =
    panelY - currentPanelHeight / 2 +
    headerHeight + panelPadding + lineHeight / 2;
  return {
    optionsLayout,
    compactFactor,
    sideMix: controlSideMix(),
    panelPadding,
    targetPanelWidth,
    targetPanelHeight,
    y: panelY,
    top: contentTop,
    height: contentHeight,
    headerHeight,
    lineHeight,
    lineGap,
    normalWidth,
    selectedWidth,
    order,
  };
}

function layerBarTargetAtPointer() {
  let state = scene.ui.layerBar;
  if (
    !scene.text.edit ||
    state.position < 0.99 ||
    state.bounds == null
  ) {
    return null;
  }
  for (let [key, bounds] of Object.entries(state.bounds)) {
    if (pointerInsideBounds(bounds)) return `layerItem:${key}`;
  }
  return pointerInsideBounds(state.panelBounds) ? "layerPanel" : null;
}

function beginLayerBarInteraction(target) {
  if (target == "layerPanel") return true;
  if (!target?.startsWith("layerItem:")) return false;
  let state = scene.ui.layerBar;
  let key = target.substring("layerItem:".length);
  let item = layerItemForKey(key);
  if (item == null) return false;
  state.selectedKey = key;
  if (item.type == "word") {
    selectCanvasWordForPathEditing(item.wordIndex);
  } else {
    clearCanvasTextSelection();
  }
  let bounds = state.bounds?.[key];
  if (bounds == null) return false;
  state.dragging = true;
  state.dragY = bounds.y;
  state.dragOffsetY = mouseY - height / 2 - bounds.y;
  return true;
}

function updateLayerBarInteraction(target) {
  let state = scene.ui.layerBar;
  if (!target?.startsWith("layerItem:") || !state.dragging) return false;
  let layout = layerBarLayout();
  let pointerY = mouseY - height / 2 - state.dragOffsetY;
  state.dragY = constrain(pointerY, layout.top, layout.top + layout.height);
  let targetIndex = constrain(
    round((state.dragY - layout.top) / layout.lineGap),
    0,
    layout.order.length - 1,
  );
  let visualOrder = [...layout.order];
  let currentIndex = visualOrder.indexOf(state.selectedKey);
  if (currentIndex >= 0 && currentIndex != targetIndex) {
    visualOrder.splice(currentIndex, 1);
    visualOrder.splice(targetIndex, 0, state.selectedKey);
    scene.text.layerOrder = visualOrder.reverse();
    inout.audio.ui?.slide(
      "layerBar",
      targetIndex / max(1, layout.order.length - 1),
      mouseX / width,
    );
  }
  return true;
}

function endLayerBarInteraction(target) {
  if (target == "layerPanel") return true;
  if (!target?.startsWith("layerItem:")) return false;
  scene.ui.layerBar.dragging = false;
  saveTextMemory();
  recordEditorHistory();
  return true;
}

function drawLayerBar() {
  let state = scene.ui.layerBar;
  let visible =
    scene.session.mode == "active" &&
    scene.text.edit &&
    data.loading.ready &&
    syncLayerOrder().length > 0;
  state.position = animateData(
    state.position,
    visible ? 1 : 0,
    0.25,
  );
  if (!visible && state.position < 0.001) {
    state.bounds = null;
    state.panelBounds = null;
    return;
  }

  let layout = layerBarLayout();
  state.panelWidth = layout.targetPanelWidth;
  if (state.panelHeight <= 0) {
    state.panelHeight = layout.targetPanelHeight;
  } else {
    state.panelHeight = animateData(
      state.panelHeight,
      layout.targetPanelHeight,
      0.3,
    );
  }
  let leftVisiblePanelX =
    layout.optionsLayout.x - layout.optionsLayout.panelWidth / 2 +
    state.panelWidth / 2;
  let rightVisiblePanelX =
    layout.optionsLayout.x + layout.optionsLayout.panelWidth / 2 -
    state.panelWidth / 2;
  let visiblePanelX = lerp(
    leftVisiblePanelX,
    rightVisiblePanelX,
    layout.sideMix,
  );
  let hiddenPanelX = lerp(
    -width / 2 - state.panelWidth / 2,
    width / 2 + state.panelWidth / 2,
    layout.sideMix,
  );
  let panelX = lerp(
    hiddenPanelX,
    visiblePanelX,
    state.position,
  );
  state.panelBounds = {
    x: panelX,
    y: layout.y,
    w: state.panelWidth,
    h: state.panelHeight,
  };
  state.bounds = Object.create(null);
  push();
  translate(0, 0, 40);
  scene.gui.layerPanel.update(
    scene.elapsedTime,
    uiPointer(),
    uiPointerActive(),
  );
  scene.gui.layerPanel.surface(
    panelX,
    layout.y,
    state.panelWidth,
    state.panelHeight,
    scene.ui.button.radius * scene.ui.scale,
  );
  pop();

  push();
  resetShader();
  translate(0, 0, 48);
  noStroke();
  fill(255, 255 * state.position);
  textFont(scene.font);
  textAlign(layout.sideMix < 0.5 ? LEFT : RIGHT, CENTER);
  textSize(34 * scene.ui.scale * layout.compactFactor);
  text(
    "Layers",
    lerp(
      panelX - state.panelWidth / 2 + layout.panelPadding,
      panelX + state.panelWidth / 2 - layout.panelPadding,
      layout.sideMix,
    ),
    layout.y - state.panelHeight / 2 + layout.headerHeight / 2 -
      6 * scene.ui.scale,
  );
  rectMode(CENTER);
  for (let i = 0; i < layout.order.length; i++) {
    let key = layout.order[i];
    let item = layerItemForKey(key);
    let selected = key == state.selectedKey;
    let targetWidth = selected ? layout.selectedWidth : layout.normalWidth;
    let targetY = layout.top + i * layout.lineGap;
    let currentWidth = state.widths[key] ?? layout.normalWidth;
    let currentY = state.positions[key] ?? targetY;
    currentWidth = animateData(currentWidth, targetWidth, 0.4);
    currentY = state.dragging && selected
      ? state.dragY
      : animateData(currentY, targetY, 0.4);
    state.widths[key] = currentWidth;
    state.positions[key] = currentY;
    let leftLineX =
      panelX - state.panelWidth / 2 +
      layout.panelPadding + currentWidth / 2;
    let rightLineX =
      panelX + state.panelWidth / 2 -
      layout.panelPadding - currentWidth / 2;
    let lineX = lerp(leftLineX, rightLineX, layout.sideMix);
    let rowAssetKey = item?.type == "photo"
      ? "layerLocked"
      : selected
        ? "layerActive"
        : "layerIdle";
    let rowAsset = scene.flowUi.slices[rowAssetKey];
    if (rowAsset?.width > 1) {
      imageMode(CENTER);
      image(
        rowAsset,
        lineX,
        currentY,
        currentWidth,
        layout.lineHeight,
      );
    }
    push();
    translate(0, 0, 1);
    let rowLabel = item?.type == "photo"
      ? "Photo"
      : textWords()[item.wordIndex] || `Text ${item.wordIndex + 1}`;
    let labelColor = item?.type == "photo"
      ? 190
      : selected
        ? 29
        : 255;
    fill(labelColor, 255 * state.position);
    textFont(scene.font);
    textAlign(LEFT, CENTER);
    textSize(layout.lineHeight * 0.48);
    let rowLeft = lineX - currentWidth / 2;
    let handleX = rowLeft + layout.lineHeight * 0.48;
    let handleWidth = layout.lineHeight * 0.28;
    stroke(labelColor, 255 * state.position);
    strokeWeight(max(1, 2 * scene.ui.scale));
    for (let handleIndex = -1; handleIndex <= 1; handleIndex++) {
      let handleY = currentY + handleIndex * 5 * scene.ui.scale;
      line(
        handleX - handleWidth / 2,
        handleY,
        handleX + handleWidth / 2,
        handleY,
      );
    }
    noStroke();
    text(
      rowLabel,
      rowLeft + layout.lineHeight * 0.88,
      currentY - layout.lineHeight * 0.04,
    );
    state.bounds[key] = {
      x: lineX,
      y: currentY,
      w: max(currentWidth, 44 * scene.ui.scale),
      h: max(layout.lineGap, 32 * scene.ui.scale),
    };
    pop();
  }
  pop();
}
