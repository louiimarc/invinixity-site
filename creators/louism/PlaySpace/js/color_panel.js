function hsvToRgbValues(color) {
  let h = ((color.hue % 1) + 1) % 1;
  let s = constrain(color.saturation, 0, 1);
  let v = constrain(color.brightness, 0, 1);
  let sector = h * 6;
  let chroma = v * s;
  let x = chroma * (1 - abs((sector % 2) - 1));
  let rgb;

  if (sector < 1) rgb = [chroma, x, 0];
  else if (sector < 2) rgb = [x, chroma, 0];
  else if (sector < 3) rgb = [0, chroma, x];
  else if (sector < 4) rgb = [0, x, chroma];
  else if (sector < 5) rgb = [x, 0, chroma];
  else rgb = [chroma, 0, x];

  let match = v - chroma;
  return rgb.map((channel) => channel + match);
}

function drawHsbColorSliders(color, saveButton) {
  let sliderWidth = 380 * scene.ui.scale;
  let sliderHeight = 52 * scene.ui.scale;
  let sliderGap = 12 * scene.ui.scale;
  let visibleX =
    -width / 2 +
    scene.ui.button.padding * scene.ui.scale +
    sliderWidth / 2;
  let hiddenX =
    -width / 2 - sliderWidth - scene.ui.button.padding * scene.ui.scale;
  scene.ui.colorPanel.position = animateData(
    scene.ui.colorPanel.position,
    scene.text.edit && data.loading.ready ? 1 : 0,
    0.25,
  );
  let sliderX = map(
    scene.ui.colorPanel.position,
    0,
    1,
    hiddenX,
    visibleX,
  );
  let sliderTop =
    saveButton.y + saveButton.h / 2 + sliderGap + sliderHeight / 2;
  let sliders = [
    { gui: scene.gui.hue, channel: "hue", value: color.hue },
    {
      gui: scene.gui.saturation,
      channel: "saturation",
      value: color.saturation,
    },
    {
      gui: scene.gui.brightness,
      channel: "brightness",
      value: color.brightness,
    },
  ];

  for (let i = 0; i < sliders.length; i++) {
    let slider = sliders[i];
    let sliderY = sliderTop + i * (sliderHeight + sliderGap);
    slider.gui.armed = scene.ui.pointer.pressTarget == slider.channel;
    slider.gui.update(scene.elapsedTime, uiPointer(), uiPointerActive());
    slider.gui.slider(
      sliderX,
      sliderY,
      sliderWidth,
      sliderHeight,
      sliderHeight / 2,
      slider.value,
      color.hue * 360,
      color.saturation * 100,
      color.brightness * 100,
    );
  }
}

function rgbToHsvValues(rgb, fallbackHue = 0) {
  let r = constrain(rgb[0], 0, 1);
  let g = constrain(rgb[1], 0, 1);
  let b = constrain(rgb[2], 0, 1);
  let maximum = max(r, g, b);
  let minimum = min(r, g, b);
  let delta = maximum - minimum;
  let hue = fallbackHue;

  if (delta > 0.00001) {
    if (maximum == r) hue = ((g - b) / delta) % 6;
    else if (maximum == g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue = ((hue / 6) % 1 + 1) % 1;
  }

  return {
    hue,
    saturation: maximum == 0 ? 0 : delta / maximum,
    brightness: maximum,
  };
}

function setTextRgbValue(channel, value) {
  let entry = textWordEntries()[scene.text.activeWord];
  let channelIndex = { red: 0, green: 1, blue: 2 }[channel];
  if (entry == null || channelIndex == null) return;

  let color = textColorForWordIndex(scene.text.activeWord);
  let rgb = hsvToRgbValues(color);
  rgb[channelIndex] = constrain(value, 0, 1);
  scene.text.colors[entry.key] = rgbToHsvValues(rgb, color.hue);
  saveTextMemory();
}

function setTextWheelHue(value) {
  let entry = textWordEntries()[scene.text.activeWord];
  if (entry == null) return;
  let color = textColorForWordIndex(scene.text.activeWord);
  scene.text.colors[entry.key] = {
    ...color,
    hue: ((value % 1) + 1) % 1,
  };
  saveTextMemory();
}

function setTextWheelSaturationBrightness(saturation, brightness) {
  let entry = textWordEntries()[scene.text.activeWord];
  if (entry == null) return;
  let color = textColorForWordIndex(scene.text.activeWord);
  scene.text.colors[entry.key] = {
    ...color,
    saturation: constrain(saturation, 0, 1),
    brightness: constrain(brightness, 0, 1),
  };
  saveTextMemory();
}

function colorPanelLayout() {
  let scale = scene.ui.scale;
  let padding = scene.ui.button.padding * scale;
  let innerPadding = 18 * scale;
  let headerHeight = 72 * scale;
  let sliderHeight = 48 * scale;
  let sliderGap = 10 * scale;
  let sectionGap = 28 * scale;
  let panelWidth = min(360 * scale, width - padding * 2);
  let maximumHeight = max(
    headerHeight,
    height -
      (scene.ui.button.height + scene.ui.button.padding * 3) * scale,
  );
  let fixedFullHeight =
    headerHeight +
    sectionGap +
    sliderHeight * 3 +
    sliderGap * 2 +
    innerPadding;
  let wheelSize = min(
    panelWidth - innerPadding * 2,
    250 * scale,
    max(100 * scale, maximumHeight - fixedFullHeight),
  );
  let detents = [
    headerHeight,
    headerHeight + wheelSize + innerPadding,
    fixedFullHeight + wheelSize,
  ];
  let visibleX = -width / 2 + padding + panelWidth / 2;
  let hiddenX = -width / 2 - panelWidth - padding;
  let panelX = map(
    scene.ui.colorPanel.position,
    0,
    1,
    hiddenX,
    visibleX,
  );

  return {
    x: panelX,
    bottom: height / 2 - padding,
    w: panelWidth,
    r: scene.ui.button.radius * scale,
    padding: innerPadding,
    headerHeight,
    wheelSize,
    sliderHeight,
    sliderGap,
    sectionGap,
    detents,
  };
}

function colorPanelPointInside(bounds, pointerX = mouseX, pointerY = mouseY) {
  if (bounds == null) return false;
  let x = pointerX - width / 2;
  let y = pointerY - height / 2;
  return (
    x >= bounds.x - bounds.w / 2 &&
    x <= bounds.x + bounds.w / 2 &&
    y >= bounds.y - bounds.h / 2 &&
    y <= bounds.y + bounds.h / 2
  );
}

function squareToDiscPoint(x, y) {
  return {
    x: x * sqrt(max(0, 1 - (y * y) / 2)),
    y: y * sqrt(max(0, 1 - (x * x) / 2)),
  };
}

function discToSquarePoint(x, y) {
  let root = sqrt(2);
  return {
    x:
      sqrt(max(0, 2 + 2 * root * x + x * x - y * y)) / 2 -
      sqrt(max(0, 2 - 2 * root * x + x * x - y * y)) / 2,
    y:
      sqrt(max(0, 2 + 2 * root * y - x * x + y * y)) / 2 -
      sqrt(max(0, 2 - 2 * root * y - x * x + y * y)) / 2,
  };
}

function colorPanelTargetAtPointer() {
  let state = scene.ui.colorPanel;
  let bounds = state.bounds;
  if (!scene.text.edit || bounds == null) {
    return null;
  }
  if (!colorPanelPointInside(bounds.panel)) return null;
  if (
    state.detent == 0 ||
    colorPanelPointInside(bounds.handle)
  ) {
    return "colorPanelHandle";
  }
  if (scene.text.activeWord < 0) return "colorPanel";

  let pointerX = mouseX - width / 2;
  let pointerY = mouseY - height / 2;
  let wheel = bounds.wheel;
  let wheelDistance = dist(pointerX, pointerY, wheel.x, wheel.y);
  let wheelRadius = wheel.w / 2;
  if (wheelDistance <= wheelRadius * 0.6) return "colorWheelSv";
  if (
    wheelDistance >= wheelRadius * 0.67 &&
    wheelDistance <= wheelRadius
  ) {
    return "colorWheelHue";
  }

  for (let channel of ["red", "green", "blue"]) {
    if (
      bounds.rgbVisible &&
      colorPanelPointInside(scene.gui[channel].bounds) &&
      colorPanelPointInside(bounds.panel)
    ) {
      return channel;
    }
  }
  return "colorPanel";
}

function updateColorWheelFromPointer(target) {
  let wheel = scene.ui.colorPanel.bounds?.wheel;
  if (wheel == null) return;
  let x = mouseX - width / 2 - wheel.x;
  let y = mouseY - height / 2 - wheel.y;

  if (target == "colorWheelHue") {
    let hue = Math.atan2(y, x) / (Math.PI * 2);
    setTextWheelHue(hue);
    inout.audio.ui?.dial(target, hue, mouseX / width);
    return;
  }

  let discRadius = wheel.w * 0.5 * 0.58;
  let magnitude = sqrt(x * x + y * y);
  if (magnitude > discRadius) {
    x = (x / magnitude) * discRadius;
    y = (y / magnitude) * discRadius;
  }
  let square = discToSquarePoint(x / discRadius, y / discRadius);
  let saturation = square.x * 0.5 + 0.5;
  let brightness = 0.5 - square.y * 0.5;
  setTextWheelSaturationBrightness(saturation, brightness);
  inout.audio.ui?.xyPad(
    target,
    saturation,
    brightness,
    mouseX / width,
  );
}

function beginColorPanelInteraction(target) {
  let state = scene.ui.colorPanel;
  if (target == "colorPanelHandle") {
    state.dragging = true;
    state.dragStartY = mouseY;
    state.dragStartHeight = state.height;
    state.dragMoved = false;
    return true;
  }
  if (target == "colorWheelHue" || target == "colorWheelSv") {
    updateColorWheelFromPointer(target);
    return true;
  }
  if (["red", "green", "blue"].includes(target)) {
    scene.ui.slider.active = target;
    let value = horizontalSliderValueFromPointer(scene.gui[target].bounds);
    setTextRgbValue(target, value);
    inout.audio.ui?.slide(target, value, mouseX / width);
    return true;
  }
  return target == "colorPanel";
}

function updateColorPanelInteraction(target) {
  let state = scene.ui.colorPanel;
  if (target == "colorPanelHandle") {
    let layout = colorPanelLayout();
    let movement = state.dragStartY - mouseY;
    state.dragMoved = state.dragMoved || abs(movement) > 6 * scene.ui.scale;
    state.height = constrain(
      state.dragStartHeight + movement,
      layout.detents[0],
      layout.detents[2],
    );
    return true;
  }
  if (target == "colorWheelHue" || target == "colorWheelSv") {
    updateColorWheelFromPointer(target);
    return true;
  }
  if (["red", "green", "blue"].includes(scene.ui.slider.active)) {
    let value = horizontalSliderValueFromPointer(
      scene.gui[scene.ui.slider.active].bounds,
    );
    setTextRgbValue(scene.ui.slider.active, value);
    inout.audio.ui?.slide(scene.ui.slider.active, value, mouseX / width);
    return true;
  }
  return target == "colorPanel";
}

function endColorPanelInteraction(target) {
  let state = scene.ui.colorPanel;
  if (target == "colorPanelHandle") {
    let detents = colorPanelLayout().detents;
    let previousDetent = state.detent;
    if (!state.dragMoved) {
      state.detent = (state.detent + 1) % detents.length;
    } else {
      let nearestDistance = Infinity;
      for (let i = 0; i < detents.length; i++) {
        let distance = abs(state.height - detents[i]);
        if (distance < nearestDistance) {
          state.detent = i;
          nearestDistance = distance;
        }
      }
    }
    inout.audio.ui?.panelSnap(
      previousDetent,
      state.detent,
      mouseX / width,
    );
    state.dragging = false;
    return true;
  }
  return (
    target == "colorWheelHue" ||
    target == "colorWheelSv" ||
    target == "colorPanel" ||
    ["red", "green", "blue"].includes(target)
  );
}

function beginColorPanelClip(bounds) {
  let gl = _renderer.GL;
  let scaleX = gl.drawingBufferWidth / width;
  let scaleY = gl.drawingBufferHeight / height;
  let left = constrain(width / 2 + bounds.x - bounds.w / 2, 0, width);
  let right = constrain(width / 2 + bounds.x + bounds.w / 2, 0, width);
  let top = constrain(height / 2 + bounds.y - bounds.h / 2, 0, height);
  let bottom = constrain(height / 2 + bounds.y + bounds.h / 2, 0, height);
  let previous = {
    enabled: gl.isEnabled(gl.SCISSOR_TEST),
    box: Array.from(gl.getParameter(gl.SCISSOR_BOX)),
  };

  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(
    floor(left * scaleX),
    floor((height - bottom) * scaleY),
    max(0, ceil((right - left) * scaleX)),
    max(0, ceil((bottom - top) * scaleY)),
  );
  return previous;
}

function endColorPanelClip(previous) {
  let gl = _renderer.GL;
  if (previous.enabled) {
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(...previous.box);
  } else {
    gl.disable(gl.SCISSOR_TEST);
  }
}

function updateColorWheelTexture(layout, color) {
  let state = scene.ui.colorPanel;
  let resolution = max(2, ceil(layout.wheelSize * 2));
  let sizeChanged = state.wheelTextureResolution != resolution;
  let hueChanged =
    state.wheelTextureHue == null ||
    abs(state.wheelTextureHue - color.hue) > 0.00001;

  if (state.wheelTexture == null) {
    state.wheelTexture = createGraphics(resolution, resolution, WEBGL);
    state.wheelTexture.pixelDensity(1);
    state.wheelTexture.noStroke();
    sizeChanged = true;
  } else if (sizeChanged) {
    state.wheelTexture.resizeCanvas(resolution, resolution);
  }

  if (sizeChanged || hueChanged) {
    state.wheelTexture.clear();
    state.wheelTexture.shader(scene.colorWheelShader);
    scene.colorWheelShader.setUniform("u_hue", color.hue);
    state.wheelTexture.noStroke();
    state.wheelTexture.rectMode(CENTER);
    state.wheelTexture.rect(0, 0, resolution, resolution);
    state.wheelTexture.resetShader();
    state.wheelTextureResolution = resolution;
    state.wheelTextureHue = color.hue;
  }

  return state.wheelTexture;
}

function drawColorWheelPickers(layout, color, wheelX, wheelY) {
  let state = scene.ui.colorPanel;

  push();
  translate(0, 0, 8);
  let wheelRadius = layout.wheelSize / 2;
  let hueAngle = color.hue * Math.PI * 2;
  let hueMarkerRadius = wheelRadius * 0.835;
  let hueMarker = {
    x: wheelX + Math.cos(hueAngle) * hueMarkerRadius,
    y: wheelY + Math.sin(hueAngle) * hueMarkerRadius,
  };
  let square = {
    x: color.saturation * 2 - 1,
    y: 1 - color.brightness * 2,
  };
  let disc = squareToDiscPoint(square.x, square.y);
  let discRadius = wheelRadius * 0.58;
  let svMarker = {
    x: wheelX + disc.x * discRadius,
    y: wheelY + disc.y * discRadius,
  };
  state.pickerScale.hue = animateData(
    state.pickerScale.hue,
    scene.ui.pointer.pressTarget == "colorWheelHue" ? 1.35 : 1,
    0.45,
  );
  state.pickerScale.saturationBrightness = animateData(
    state.pickerScale.saturationBrightness,
    scene.ui.pointer.pressTarget == "colorWheelSv" ? 1.35 : 1,
    0.45,
  );
  let hueMarkerColor = hsvToRgbValues({
    hue: color.hue,
    saturation: 1,
    brightness: 1,
  });
  let saturationBrightnessMarkerColor = hsvToRgbValues(color);

  for (let marker of [
    {
      ...hueMarker,
      scale: state.pickerScale.hue,
      color: hueMarkerColor,
    },
    {
      ...svMarker,
      scale: state.pickerScale.saturationBrightness,
      color: saturationBrightnessMarkerColor,
    },
  ]) {
    fill(
      marker.color[0] * 255,
      marker.color[1] * 255,
      marker.color[2] * 255,
    );
    stroke(0, 125);
    strokeWeight(6 * scene.ui.scale);
    circle(marker.x, marker.y, 30 * scene.ui.scale * marker.scale);
    fill(
      marker.color[0] * 255,
      marker.color[1] * 255,
      marker.color[2] * 255,
    );
    stroke(255);
    strokeWeight(3 * scene.ui.scale);
    circle(marker.x, marker.y, 30 * scene.ui.scale * marker.scale);
  }
  pop();
}

function animatedColorPanelColor(target, smooth = 0.2) {
  let state = scene.ui.colorPanel;
  if (state.displayColor == null) {
    state.displayColor = { ...target };
    return state.displayColor;
  }

  let hueDelta = ((target.hue - state.displayColor.hue + 1.5) % 1) - 0.5;
  state.displayColor.hue =
    (state.displayColor.hue + hueDelta * smooth + 1) % 1;
  state.displayColor.saturation = animateData(
    state.displayColor.saturation,
    target.saturation,
    smooth,
  );
  state.displayColor.brightness = animateData(
    state.displayColor.brightness,
    target.brightness,
    smooth,
  );
  return state.displayColor;
}

function drawColorPanel(color) {
  let state = scene.ui.colorPanel;
  let displayColor = animatedColorPanelColor(color);
  let panelVisible = scene.text.edit && data.loading.ready;
  state.position = animateData(
    state.position,
    panelVisible ? 1 : 0,
    0.25,
  );
  if (!panelVisible && state.position < 0.001) {
    state.bounds = null;
    return;
  }
  let layout = colorPanelLayout();
  let targetHeight = layout.detents[state.detent];
  if (state.height <= 0) state.height = targetHeight;
  if (!state.dragging) {
    state.height = animateData(state.height, targetHeight, 0.25);
  }

  let panelY = layout.bottom - state.height / 2;
  let panelBounds = {
    x: layout.x,
    y: panelY,
    w: layout.w,
    h: state.height,
  };
  let panelTop = panelY - state.height / 2;
  let handleBounds = {
    x: layout.x,
    y: panelTop + 14 * scene.ui.scale,
    w: 80 * scene.ui.scale,
    h: 28 * scene.ui.scale,
  };
  let wheelX = layout.x;
  let wheelY = panelTop + layout.headerHeight + layout.wheelSize / 2;
  let wheelBounds = {
    x: wheelX,
    y: wheelY,
    w: layout.wheelSize,
    h: layout.wheelSize,
  };
  state.bounds = {
    panel: panelBounds,
    handle: handleBounds,
    wheel: wheelBounds,
    rgbVisible: false,
  };

  let wheelTexture = updateColorWheelTexture(layout, displayColor);

  scene.gui.colorPanel.update(
    scene.elapsedTime,
    uiPointer(),
    uiPointerActive(),
  );
  scene.panelShader.setUniform("u_overlay_enabled", 1);
  scene.panelShader.setUniform("texture1", wheelTexture);
  scene.panelShader.setUniform("u_overlay_center", [
    0.5,
    (wheelY - panelTop) / state.height,
  ]);
  scene.panelShader.setUniform("u_overlay_size", [
    layout.wheelSize / layout.w,
    layout.wheelSize / state.height,
  ]);
  scene.gui.colorPanel.surface(
    layout.x,
    panelY,
    layout.w,
    state.height,
    layout.r,
    0,
    0,
    100,
  );

  let clipState = beginColorPanelClip(panelBounds);
  push();
  translate(0, 0, 8);
  noStroke();
  rectMode(CENTER);
  let handleOpacity = constrain(
    map(
      state.height,
      layout.detents[0],
      layout.detents[0] + 40 * scene.ui.scale,
      0,
      255,
    ),
    0,
    255,
  );
  fill(255, handleOpacity);
  rect(
    handleBounds.x,
    handleBounds.y,
    64 * scene.ui.scale,
    6 * scene.ui.scale,
    3 * scene.ui.scale,
  );
  fill(255);
  textFont(scene.font);
  textAlign(LEFT, CENTER);
  textSize(44 * scene.ui.scale);
  let headerContentY = panelTop + layout.headerHeight * 0.5;
  text(
    "Colors",
    layout.x - layout.w / 2 + layout.padding,
    headerContentY,
  );

  let displayRgb = hsvToRgbValues(displayColor);
  let previewWidth = 64 * scene.ui.scale;
  let previewHeight = 42 * scene.ui.scale;
  fill(displayRgb[0] * 255, displayRgb[1] * 255, displayRgb[2] * 255);
  rect(
    layout.x + layout.w / 2 - layout.padding - previewWidth / 2,
    headerContentY,
    previewWidth,
    previewHeight,
    previewHeight / 2,
  );
  pop();

  drawColorWheelPickers(layout, displayColor, wheelX, wheelY);

  let sliderWidth = max(0, layout.w - layout.r * 2);
  let sliderTop =
    panelTop +
    layout.headerHeight +
    layout.wheelSize +
    layout.sectionGap +
    layout.sliderHeight / 2;
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
  let panelBottom = panelTop + state.height;
  for (let i = 0; i < sliders.length; i++) {
    let slider = sliders[i];
    let sliderY =
      sliderTop + i * (layout.sliderHeight + layout.sliderGap);
    let sliderVisible =
      sliderY + layout.sliderHeight / 2 > panelTop &&
      sliderY - layout.sliderHeight / 2 < panelBottom;
    slider.gui = scene.gui[slider.channel];

    if (!sliderVisible) {
      slider.gui.bounds = null;
      continue;
    }

    state.bounds.rgbVisible = true;
    slider.gui.armed = scene.ui.pointer.pressTarget == slider.channel;
    slider.gui.update(scene.elapsedTime, uiPointer(), uiPointerActive());
    push();
    translate(0, 0, 64);
    slider.gui.gradientSlider(
      layout.x,
      sliderY,
      sliderWidth,
      layout.sliderHeight,
      layout.sliderHeight / 2,
      slider.value,
      slider.start,
      slider.end,
    );
    pop();
  }
  endColorPanelClip(clipState);
}
