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
  let baseTextSize = min(width, height) / 4;
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
  let textureLayout = texturePadLayout();
  let lineHeight = 6 * scale;
  let lineGap = 22 * scale;
  let normalWidth = 44 * scale;
  let selectedWidth = 92 * scale;
  let contentHeight = max(
    lineHeight,
    (order.length - 1) * lineGap + lineHeight,
  );
  let panelPadding = 18 * scale;
  let activeWidth = scene.ui.layerBar.selectedKey == null
    ? normalWidth
    : selectedWidth;
  let targetPanelWidth = activeWidth + panelPadding * 2;
  let targetPanelHeight = contentHeight + panelPadding * 2;
  let panelRight =
    textureLayout.x + textureLayout.panelWidth / 2;
  let lineRight = panelRight - panelPadding;
  return {
    panelRight,
    panelPadding,
    targetPanelWidth,
    targetPanelHeight,
    lineRight,
    y: 0,
    top: -contentHeight / 2,
    height: contentHeight,
    lineHeight,
    lineGap,
    normalWidth,
    selectedWidth,
    order,
  };
}

function layerBarTargetAtPointer() {
  let state = scene.ui.layerBar;
  if (!scene.text.edit || state.bounds == null) {
    return null;
  }
  let selectedBounds = state.bounds[state.selectedKey];
  if (
    selectedBounds != null &&
    pointerInsideBounds(selectedBounds)
  ) {
    return "layerBar";
  }
  return pointerInsideBounds(state.panelBounds) ? "layerPanel" : null;
}

function beginLayerBarInteraction(target) {
  if (target == "layerPanel") return true;
  if (target != "layerBar") return false;
  let state = scene.ui.layerBar;
  let bounds = state.bounds?.[state.selectedKey];
  if (bounds == null) return false;
  state.dragging = true;
  state.dragY = bounds.y;
  state.dragOffsetY = mouseY - height / 2 - bounds.y;
  return true;
}

function updateLayerBarInteraction(target) {
  let state = scene.ui.layerBar;
  if (target != "layerBar" || !state.dragging) return false;
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
  if (target != "layerBar") return false;
  scene.ui.layerBar.dragging = false;
  saveTextMemory();
  return true;
}

function drawLayerBar() {
  let state = scene.ui.layerBar;
  let visible =
    scene.session.mode == "active" &&
    scene.text.edit &&
    data.loading.ready &&
    syncLayerOrder().length > 0;
  if (!visible) {
    state.bounds = null;
    state.panelBounds = null;
    return;
  }

  let layout = layerBarLayout();
  if (state.panelWidth <= 0) {
    state.panelWidth = layout.targetPanelWidth;
  } else {
    state.panelWidth = animateData(
      state.panelWidth,
      layout.targetPanelWidth,
      0.3,
    );
  }
  if (state.panelHeight <= 0) {
    state.panelHeight = layout.targetPanelHeight;
  } else {
    state.panelHeight = animateData(
      state.panelHeight,
      layout.targetPanelHeight,
      0.3,
    );
  }
  let panelX = layout.panelRight - state.panelWidth / 2;
  state.panelBounds = {
    x: panelX,
    y: 0,
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
    0,
    state.panelWidth,
    state.panelHeight,
    scene.ui.button.radius * scene.ui.scale,
  );
  pop();

  push();
  resetShader();
  translate(0, 0, 48);
  noStroke();
  rectMode(CENTER);
  for (let i = 0; i < layout.order.length; i++) {
    let key = layout.order[i];
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
    fill(255, selected ? 245 : 165);
    let lineX = layout.lineRight - currentWidth / 2;
    rect(
      lineX,
      currentY,
      currentWidth,
      layout.lineHeight,
      layout.lineHeight / 2,
    );
    state.bounds[key] = {
      x: lineX,
      y: currentY,
      w: max(currentWidth, 44 * scene.ui.scale),
      h: max(layout.lineGap, 32 * scene.ui.scale),
    };
  }
  pop();
}
