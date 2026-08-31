function defaultSessionBackgroundColor() {
  return { hue: 0, saturation: 0, brightness: 0.5 };
}

function sizedFrameOverlaySvg(source) {
  return source.replace(
    '<svg width="100%" height="100%"',
    `<svg width="${scene.creationCard.width}" ` +
      `height="${scene.creationCard.height}"`,
  );
}

function frameOverlayArtworkSvg(source) {
  return sizedFrameOverlaySvg(source).replace(
    /(<path id="Text"[^>]*style="[^"]*fill:)#[0-9a-fA-F]{6}/,
    (match, prefix) => prefix + "none",
  );
}

function frameOverlayTextMaskSvg(source) {
  let sizedSource = sizedFrameOverlaySvg(source);
  let svgTag = sizedSource.match(/<svg\b[^>]*>/)?.[0];
  let textPath = sizedSource.match(/<path id="Text"[^>]*>/)?.[0];
  if (svgTag == null || textPath == null) return null;
  textPath = textPath.replace(
    /fill:#[0-9a-fA-F]{6}/,
    "fill:#ffffff",
  );
  return '<?xml version="1.0" encoding="UTF-8"?>' +
    svgTag + textPath + "</svg>";
}

function loadFrameOverlaySvgImage(key, source) {
  let state = scene.frameOverlay;
  let url = URL.createObjectURL(
    new Blob([source], { type: "image/svg+xml" }),
  );
  state[key] = loadImage(
    url,
    (image) => {
      URL.revokeObjectURL(url);
      image.resize(scene.creationCard.width, scene.creationCard.height);
      loaded();
    },
    (error) => {
      URL.revokeObjectURL(url);
      console.warn(`Unable to load ${key} SVG overlay`, error);
      loaded();
    },
  );
}

function preloadFrameOverlayAssets() {
  let state = scene.frameOverlay;
  loadStrings(
    state.sourcePath,
    (lines) => {
      let source = lines.join("\n");
      let artwork = frameOverlayArtworkSvg(source);
      let textMask = frameOverlayTextMaskSvg(source);
      if (textMask == null) {
        console.warn("Frame overlay SVG is missing its Text path");
        loaded();
        loaded();
        return;
      }
      loadFrameOverlaySvgImage("artwork", artwork);
      loadFrameOverlaySvgImage("textMask", textMask);
    },
    (error) => {
      console.warn("Unable to load frame overlay SVG", error);
      loaded();
      loaded();
    },
  );
}

function frameOverlayPaletteIndex() {
  let panel = scene.ui?.colorPanel;
  if (panel?.selectedPaletteIndex != null) {
    return panel.selectedPaletteIndex;
  }
  let palettePosition =
    (colorWheelPickerHue() - (panel?.wheelRotation ?? 0.25) + 1) % 1;
  return round(palettePosition * scene.frameOverlay.paletteHexes.length) %
    scene.frameOverlay.paletteHexes.length;
}

function frameOverlayForegroundTarget() {
  let state = scene.frameOverlay;
  let backgroundHex = state.paletteHexes[frameOverlayPaletteIndex()];
  return state.darkForegroundBackgrounds.includes(backgroundHex) ? 0 : 1;
}

function drawFrameOverlay(target = scene.workspace, layerZ = 64) {
  let state = scene.frameOverlay;
  let artwork = state.artwork;
  let textMask = state.textMask;
  if (
    target == null ||
    artwork == null ||
    textMask == null ||
    artwork.width <= 1 ||
    textMask.width <= 1
  ) return;
  state.foregroundMix = animateData(
    state.foregroundMix,
    frameOverlayForegroundTarget(),
    0.08,
  );
  let bounds = creationCardBounds();
  let sourceInset = 2;
  target.push();
  target.resetShader();
  target.noStroke();
  target.imageMode(CENTER);
  target.translate(
    bounds.x + bounds.width / 2 - width / 2,
    bounds.y + bounds.height / 2 - height / 2,
    scene.layer.content + layerZ,
  );
  target.image(
    artwork,
    0,
    0,
    bounds.width,
    bounds.height,
    sourceInset,
    sourceInset,
    artwork.width - sourceInset * 2,
    artwork.height - sourceInset * 2,
  );
  let foregroundValue = lerp(29, 255, state.foregroundMix);
  target.tint(foregroundValue);
  target.image(
    textMask,
    0,
    0,
    bounds.width,
    bounds.height,
    sourceInset,
    sourceInset,
    textMask.width - sourceInset * 2,
    textMask.height - sourceInset * 2,
  );
  target.noTint();
  target.pop();
}

function resetSessionBackgroundColor(randomizePalette = false) {
  scene.session.backgroundColor = defaultSessionBackgroundColor();
  let panel = scene.ui?.colorPanel;
  if (panel == null) return;
  let previousPaletteIndex = panel.selectedPaletteIndex ??
    panel.previousSessionPaletteIndex;
  if (panel.selectedPaletteIndex != null) {
    panel.previousSessionPaletteIndex = panel.selectedPaletteIndex;
  }
  panel.color = { hue: 0, saturation: 0, brightness: 0.5 };
  panel.wheelRotation = colorWheelPickerHue();
  panel.wheelVelocity = 0;
  panel.wheelSnapActive = false;
  panel.wheelSettled = true;
  panel.wheelDiskMorph = 1;
  panel.wheelDiskMorphIndex = 0;
  panel.selectedPaletteIndex = null;
  if (randomizePalette) {
    let paletteCount = scene.frameOverlay.paletteHexes.length;
    let paletteIndex = floor(Math.random() * paletteCount);
    if (previousPaletteIndex != null && paletteCount > 1) {
      paletteIndex = floor(Math.random() * (paletteCount - 1));
      if (paletteIndex >= previousPaletteIndex) paletteIndex++;
    }
    panel.previousSessionPaletteIndex = paletteIndex;
    setSessionBackgroundPalette(paletteIndex, true);
  }
}

function setSessionBackgroundPalette(index, syncWheel = false) {
  let paletteCount = scene.frameOverlay.paletteHexes.length;
  let paletteIndex = ((round(index) % paletteCount) + paletteCount) %
    paletteCount;
  let huePosition = paletteIndex / paletteCount;
  let rgb = colorWheelPaletteRgb(huePosition);
  scene.session.backgroundColor = rgbToHsvValues(rgb);
  let panel = scene.ui.colorPanel;
  panel.selectedPaletteIndex = paletteIndex;
  if (!syncWheel) return;
  panel.color = {
    ...panel.color,
    hue: huePosition,
  };
  panel.wheelRotation =
    (colorWheelPickerHue() - huePosition + 1) % 1;
  panel.wheelVelocity = 0;
  panel.wheelSnapActive = false;
  panel.wheelSettled = true;
  panel.wheelDiskMorph = 1;
  panel.wheelDiskMorphIndex = paletteIndex * 3;
}

function sessionBackgroundRgb() {
  return hsvToRgbValues(scene.session.backgroundColor);
}

function setSessionBackgroundPalettePosition(position) {
  let rgb = colorWheelPaletteRgb(position);
  scene.session.backgroundColor = rgbToHsvValues(rgb);
}

function drawSessionWorkspaceBackground() {
  if (["frame", "active", "secretDemo"].includes(scene.session.mode)) {
    let rgb = sessionBackgroundRgb();
    scene.workspace.background(
      rgb[0] * 255,
      rgb[1] * 255,
      rgb[2] * 255,
    );
    return;
  }

  scene.workspace.push();
  scene.workspace.imageMode(CENTER);
  scene.workspace.image(homeGradientBuffer(), 0, 0, width, height);
  scene.workspace.pop();
}
