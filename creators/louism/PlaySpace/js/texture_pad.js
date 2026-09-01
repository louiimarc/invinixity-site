function texturePadLayout() {
  let state = scene.ui.texturePad;
  let scale = scene.ui.scale;
  let padding = scene.ui.button.padding * scale;
  let buttonHeight = 72 * scale;
  if (state.titleWidthScale != scale) {
    push();
    textFont(scene.text.font || scene.font);
    textSize(buttonHeight / 1.25);
    state.titleWidth = textWidth("REHUMANIZE");
    state.titleWidthScale = scale;
    pop();
  }
  let panelWidth = max(220 * scale, state.titleWidth + buttonHeight);
  let panelHeight = buttonHeight;
  let rightVisibleX = width / 2 - padding - panelWidth / 2;
  let leftVisibleX = -width / 2 + padding + panelWidth / 2;
  let rightHiddenX = width / 2 + padding + panelWidth / 2;
  let leftHiddenX = -width / 2 - padding - panelWidth / 2;
  let sideMix = controlSideMix();
  let visibleX = lerp(leftVisibleX, rightVisibleX, sideMix);
  let hiddenX = lerp(leftHiddenX, rightHiddenX, sideMix);
  let panelX = lerp(hiddenX, visibleX, state.position);
  let panelY = height < 800 * scale ? 70 * scale : 0;
  return {
    x: panelX,
    y: panelY,
    size: panelWidth,
    panelWidth,
    panelHeight,
    panelRadius: scene.ui.button.radius * scale,
  };
}

function updateOptionsWorkspaceLayout() {
  let nextWidth = texturePadLayout().panelWidth;
  let previousWidth = scene.composition.controlPanelWidth;
  if (!Number.isFinite(previousWidth)) {
    scene.composition.controlPanelWidth = nextWidth;
    return;
  }
  if (abs(previousWidth - nextWidth) < 0.001) return;

  if (scene.session.mode == "active" && scene.text.edit) {
    let sideMix = controlSideMix();
    let from = creationCardBounds(
      width,
      height,
      scene.ui.controlSide,
      true,
      sideMix,
      previousWidth,
    );
    let to = creationCardBounds(
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
  let bounds = scene.ui.texturePad.bounds?.button;
  if (!scene.text.edit || bounds == null) return null;
  return pointerInsideBounds(bounds) ? "rehumanize" : null;
}

function beginTexturePadInteraction(target) {
  return target == "rehumanize";
}

function updateTexturePadInteraction(target) {
  return target == "rehumanize";
}

function endTexturePadInteraction(target) {
  if (target != "rehumanize") return false;
  let bounds = scene.ui.texturePad.bounds?.button;
  if (bounds != null && pointerInsideBounds(bounds)) {
    if (rehumanizeNameTextures()) {
      inout.audio.ui?.tap("rehumanize", mouseX / width);
    }
  }
  return true;
}

function drawTexturePad() {
  let visible =
    scene.session.mode == "active" && scene.text.edit && data.loading.ready;
  let state = scene.ui.texturePad;
  state.position = animateData(state.position, visible ? 1 : 0, 0.25);
  if (!visible && state.position < 0.001) {
    state.bounds = null;
    scene.gui.texturePanel.bounds = null;
    return;
  }

  let layout = texturePadLayout();
  scene.gui.texturePanel.label = "REHUMANIZE";
  scene.gui.texturePanel.armed =
    scene.ui.pointer.pressTarget == "rehumanize";
  scene.gui.texturePanel.update(
    scene.elapsedTime,
    uiPointer(),
    uiPointerActive(),
  );
  scene.gui.texturePanel.button(
    layout.x,
    layout.y,
    layout.panelWidth,
    layout.panelHeight,
    layout.panelRadius,
  );
  state.bounds = {
    panel: { ...scene.gui.texturePanel.bounds },
    button: { ...scene.gui.texturePanel.bounds },
  };
}
