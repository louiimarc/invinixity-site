function colorPanelIsAvailable() {
  return scene.session.mode == "active";
}

function colorPanelIsActive() {
  return colorPanelIsAvailable() && scene.text.edit;
}

function colorWheelPaletteRgb(position) {
  let colors = [
    [247, 157, 31],
    [205, 221, 70],
    [219, 220, 218],
    [123, 203, 187],
    [193, 190, 223],
    [77, 20, 48],
  ];
  let segment = (((position % 1) + 1) % 1) * colors.length;
  let index = floor(segment) % colors.length;
  let nextIndex = (index + 1) % colors.length;
  let amount = segment - floor(segment);
  return colors[index].map(
    (channel, channelIndex) =>
      lerp(channel, colors[nextIndex][channelIndex], amount) / 255,
  );
}

function colorWheelPickerHue() {
  return 0.25;
}

function setTextWheelHue(value) {
  scene.ui.colorPanel.color = {
    ...scene.ui.colorPanel.color,
    hue: ((value % 1) + 1) % 1,
  };
}

function colorWheelPointerTurn() {
  let wheel = scene.ui.colorPanel.bounds?.wheel;
  if (wheel == null) return 0;
  let x = mouseX - width / 2 - wheel.x;
  let y = mouseY - height / 2 - wheel.y;
  return Math.atan2(y, x) / (Math.PI * 2);
}

function wrappedTurnDelta(current, previous) {
  return ((current - previous + 1.5) % 1) - 0.5;
}

function colorWheelSelectedSpokeIndex(spokeCount = 18) {
  let state = scene.ui.colorPanel;
  let selectedHue =
    (colorWheelPickerHue() - state.wheelRotation + 1) % 1;
  return round(selectedHue * spokeCount) % spokeCount;
}

function updateColorWheelHueFromRotation() {
  let huePosition =
    (
      colorWheelPickerHue() -
      scene.ui.colorPanel.wheelRotation +
      1
    ) % 1;
  setTextWheelHue(huePosition);
  setSessionBackgroundPalettePosition(huePosition);
}

function beginColorWheelRotation() {
  let state = scene.ui.colorPanel;
  state.wheelDragging = true;
  state.wheelVelocity = 0;
  state.wheelSnapActive = false;
  state.wheelSettled = false;
  state.wheelDiskMorphIndex = colorWheelSelectedSpokeIndex();
  state.selectedPaletteIndex = null;
  state.wheelLastTurn = colorWheelPointerTurn();
  state.wheelLastTime = millis() / 1000;
}

function updateColorWheelRotation() {
  let state = scene.ui.colorPanel;
  let now = millis() / 1000;
  let turn = colorWheelPointerTurn();
  let delta = wrappedTurnDelta(turn, state.wheelLastTurn);
  let elapsed = max(1 / 240, now - state.wheelLastTime);
  let instantaneousVelocity = constrain(delta / elapsed, -3, 3);

  state.wheelRotation = (state.wheelRotation + delta + 1) % 1;
  state.wheelVelocity = lerp(
    state.wheelVelocity,
    instantaneousVelocity,
    0.65,
  );
  state.wheelLastTurn = turn;
  state.wheelLastTime = now;
  updateColorWheelHueFromRotation();
  inout.audio.ui?.dial(
    "colorWheelHue",
    scene.ui.colorPanel.color.hue,
    mouseX / width,
    abs(instantaneousVelocity),
  );
}

function playColorWheelInertiaSound(previousRotation, elapsed) {
  if (elapsed <= 0) return;
  let state = scene.ui.colorPanel;
  let angularSpeed = abs(
    wrappedTurnDelta(state.wheelRotation, previousRotation) / elapsed,
  );
  if (angularSpeed < 0.001) return;
  let pointerX = state.bounds?.wheel == null
    ? 0.5
    : constrain(
      (width / 2 + state.bounds.wheel.x) / width,
      0,
      1,
    );
  inout.audio.ui?.dial(
    "colorWheelHue",
    state.color.hue,
    pointerX,
    angularSpeed,
  );
}

function updateColorWheelInertia() {
  let state = scene.ui.colorPanel;
  let now = scene.elapsedTime;
  if (state.wheelUpdateTime <= 0) {
    state.wheelUpdateTime = now;
    return;
  }
  let elapsed = constrain(now - state.wheelUpdateTime, 0, 0.05);
  state.wheelUpdateTime = now;
  if (state.wheelDragging) {
    return;
  }

  if (state.wheelSnapActive) {
    let previousRotation = state.wheelRotation;
    let delta = wrappedTurnDelta(
      state.wheelSnapTarget,
      state.wheelRotation,
    );
    let snapAmount = 1 - pow(0.78, elapsed * 60);
    state.wheelRotation =
      (state.wheelRotation + delta * snapAmount + 1) % 1;
    updateColorWheelHueFromRotation();
    playColorWheelInertiaSound(previousRotation, elapsed);

    if (abs(delta) < 0.00025) {
      state.wheelRotation = state.wheelSnapTarget;
      state.wheelSnapActive = false;
      state.wheelSettled = true;
      updateColorWheelHueFromRotation();
      setSessionBackgroundPalette(state.wheelSnapIndex);
      saveTextMemory();
      recordEditorHistory();
    }
    return;
  }

  if (!state.wheelSettled && abs(state.wheelVelocity) < 0.04) {
    let selectedHue =
      (colorWheelPickerHue() - state.wheelRotation + 1) % 1;
    let paletteIndex = round(selectedHue * 6) % 6;
    let targetHue = paletteIndex / 6;
    state.wheelVelocity = 0;
    state.wheelSnapIndex = paletteIndex;
    state.wheelSnapTarget =
      (colorWheelPickerHue() - targetHue + 1) % 1;
    state.wheelSnapActive = true;
    return;
  }

  if (state.wheelSettled) return;

  let previousRotation = state.wheelRotation;
  state.wheelRotation =
    (state.wheelRotation + state.wheelVelocity * elapsed + 1) % 1;
  state.wheelVelocity *= pow(0.965, elapsed * 60);
  updateColorWheelHueFromRotation();
  playColorWheelInertiaSound(previousRotation, elapsed);
}

function updateColorWheelDiskMorph() {
  let state = scene.ui.colorPanel;
  let settled = state.wheelSettled && !state.wheelSnapActive;
  let selectedIndex = colorWheelSelectedSpokeIndex();
  if (settled && state.wheelDiskMorphIndex == null) {
    state.wheelDiskMorphIndex = selectedIndex;
  }
  let ownsCurrentColor = state.wheelDiskMorphIndex == selectedIndex;
  let target = settled && ownsCurrentColor ? 1 : 0;
  state.wheelDiskMorph = animateData(
    state.wheelDiskMorph,
    target,
    0.08,
  );
  if (abs(state.wheelDiskMorph - target) < 0.001) {
    state.wheelDiskMorph = target;
    if (target == 0) {
      state.wheelDiskMorphIndex = settled ? selectedIndex : null;
    }
  }
}

function colorPanelLayout() {
  let scale = scene.ui.scale;
  let padding = scene.ui.button.padding * scale;
  let wheelSize = min(
    500 * scale,
    width - padding * 2,
  );
  return { wheelSize };
}

function colorPanelTargetAtPointer() {
  let state = scene.ui.colorPanel;
  let bounds = state.bounds;
  if (!colorPanelIsActive() || bounds == null) {
    return null;
  }
  let pointerX = mouseX - width / 2;
  let pointerY = mouseY - height / 2;
  let wheel = bounds.wheel;
  let wheelDistance = dist(pointerX, pointerY, wheel.x, wheel.y);
  let wheelRadius = wheel.w / 2;
  if (
    wheelDistance >= wheelRadius * 0.54 &&
    wheelDistance <= wheelRadius
  ) {
    return "colorWheelHue";
  }
  return null;
}

function beginColorPanelInteraction(target) {
  if (target == "colorWheelHue") {
    beginColorWheelRotation();
    return true;
  }
  return false;
}

function updateColorPanelInteraction(target) {
  if (target == "colorWheelHue") {
    updateColorWheelRotation();
    return true;
  }
  return false;
}

function endColorPanelInteraction(target) {
  let state = scene.ui.colorPanel;
  if (target == "colorWheelHue") {
    state.wheelDragging = false;
    state.wheelSettled = false;
    return true;
  }
  return target == "colorWheelHue";
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

function updateColorWheelTexture(layout) {
  let state = scene.ui.colorPanel;
  let resolution = max(2, ceil(layout.wheelSize * 2));
  let sizeChanged = state.wheelTextureResolution != resolution;
  let rotationChanged =
    state.wheelTextureRotation == null ||
    abs(state.wheelTextureRotation - state.wheelRotation) > 0.00001;
  let hueChanged =
    state.wheelTextureHue == null ||
    abs(state.wheelTextureHue - state.color.hue) > 0.00001;
  let diskMorphChanged =
    state.wheelTextureDiskMorph == null ||
    abs(state.wheelTextureDiskMorph - state.wheelDiskMorph) > 0.00001;

  if (state.wheelTexture == null) {
    state.wheelTexture = createGraphics(resolution, resolution);
    state.wheelTexture.pixelDensity(1);
    sizeChanged = true;
  } else if (sizeChanged) {
    state.wheelTexture.resizeCanvas(resolution, resolution);
  }

  if (sizeChanged || rotationChanged || hueChanged || diskMorphChanged) {
    let wheel = state.wheelTexture;
    let center = resolution / 2;
    let radius = resolution / 2;
    let spokeCount = 18;
    let pickerTurn = colorWheelPickerHue();
    let logicalStepTurn = 1 / spokeCount;
    let activeSlotTurn = 1 / 6;
    let normalSlotTurn = (1 - activeSlotTurn) / (spokeCount - 1);
    let activeNeighborTurn =
      activeSlotTurn / 2 + normalSlotTurn / 2;
    let innerCenterOffsetY = -radius * 0.1;

    function spokeJitter(seed) {
      let value = Math.sin(seed * 12.9898) * 43758.5453;
      return (value - Math.floor(value)) * 2 - 1;
    }

    function spokePoint(angle, pointRadius, innerOffsetWeight = 0) {
      return {
        x: center + Math.cos(angle) * pointRadius,
        y:
          center +
          innerCenterOffsetY * innerOffsetWeight +
          Math.sin(angle) * pointRadius,
      };
    }

    wheel.clear();
    wheel.noStroke();
    let spokes = [];
    let selectedIndex = colorWheelSelectedSpokeIndex(spokeCount);
    let morphIndex = state.wheelDiskMorphIndex ?? selectedIndex;

    for (let index = 0; index < spokeCount; index++) {
      let tickHue = index / spokeCount;
      let rawPhysicalTurn = (tickHue + state.wheelRotation + 1) % 1;
      let pickerDelta = wrappedTurnDelta(rawPhysicalTurn, pickerTurn);
      let pickerDistance = abs(pickerDelta);
      let warpedDistance;
      if (pickerDistance <= logicalStepTurn) {
        warpedDistance =
          pickerDistance * activeNeighborTurn / logicalStepTurn;
      } else {
        warpedDistance =
          activeNeighborTurn +
          (pickerDistance - logicalStepTurn) *
            normalSlotTurn / logicalStepTurn;
      }
      let physicalTurn = (
        pickerTurn + Math.sign(pickerDelta) * warpedDistance + 1
      ) % 1;
      let selectionWindow = logicalStepTurn * 0.75;
      let selectionProgress = constrain(
        1 - pickerDistance / selectionWindow,
        0,
        1,
      );
      let selectionInfluence = selectionProgress * selectionProgress *
        (3 - 2 * selectionProgress);
      let diskMorph = index == morphIndex
        ? state.wheelDiskMorph
        : 0;
      let angle = physicalTurn * Math.PI * 2;
      let rotationPhase = state.wheelRotation * Math.PI * 2;
      let lengthNudge =
        Math.sin(rotationPhase * 2 + index * 1.73) * 0.018 +
        Math.sin(rotationPhase * 3 + index * 2.41) * 0.009;
      let innerRadius = radius * (
        0.3 + spokeJitter(index * 7) * 0.015 - lengthNudge * 0.2
      );
      let outerRadius = radius * (
        0.9 + spokeJitter(index * 11) * 0.03 + lengthNudge
      );
      let spokeStepAngle = normalSlotTurn * Math.PI * 2;
      let normalInnerHalfAngle = spokeStepAngle *
        (0.18 + spokeJitter(index * 13) * 0.015);
      let normalOuterHalfAngle = spokeStepAngle *
        (0.34 + spokeJitter(index * 17) * 0.02);
      let innerHalfAngle = lerp(
        normalInnerHalfAngle,
        Math.PI / 24,
        selectionInfluence,
      );
      let outerHalfAngle = lerp(
        normalOuterHalfAngle,
        Math.PI / 12,
        selectionInfluence,
      );
      let edgeSteps = [0, 0.3, 0.65, 1];
      let capSteps = [1 / 3, 2 / 3];

      function edgePoint(side, edgeProgress, seedOffset) {
        let edgeEase = edgeProgress * edgeProgress *
          (3 - 2 * edgeProgress);
        let edgeEnvelope = Math.sin(Math.PI * edgeProgress);
        let edgeAngle = angle + side * lerp(
          innerHalfAngle,
          outerHalfAngle,
          edgeEase,
        );
        edgeAngle += spokeJitter(index * 101 + seedOffset * 17) *
          spokeStepAngle * 0.028 * edgeEnvelope;
        let edgeRadius = lerp(innerRadius, outerRadius, edgeProgress);
        edgeRadius += spokeJitter(index * 107 + seedOffset * 23) *
          radius * 0.012 * edgeEnvelope;
        return spokePoint(
          edgeAngle,
          edgeRadius,
          1 - edgeProgress,
        );
      }

      let points = edgeSteps.map(
        (edgeProgress, edgeIndex) =>
          edgePoint(-1, edgeProgress, edgeIndex),
      );

      for (let capIndex = 0; capIndex < capSteps.length; capIndex++) {
        let capProgress = capSteps[capIndex];
        let capEnvelope = Math.sin(Math.PI * capProgress);
        let capAngle = lerp(
          angle - outerHalfAngle,
          angle + outerHalfAngle,
          capProgress,
        );
        capAngle += spokeJitter(index * 109 + capIndex * 29) *
          spokeStepAngle * 0.012;
        let capRadius = outerRadius + radius *
          (0.012 + spokeJitter(index * 113 + capIndex * 31) * 0.004) *
          capEnvelope;
        points.push(spokePoint(capAngle, capRadius));
      }

      for (let edgeIndex = edgeSteps.length - 1; edgeIndex >= 0; edgeIndex--) {
        points.push(edgePoint(1, edgeSteps[edgeIndex], edgeIndex + 8));
      }

      if (diskMorph > 0) {
        let diskCenter = {
          x: center,
          y: center + innerCenterOffsetY,
        };
        let diskRadius = radius * 0.17;
        let innerAnchor = {
          x: (points[0].x + points[points.length - 1].x) / 2,
          y: (points[0].y + points[points.length - 1].y) / 2,
        };
        let shrinkProgress = constrain(diskMorph * 1.5, 0, 1);
        let shrinkEase = shrinkProgress * shrinkProgress *
          (3 - 2 * shrinkProgress);
        let shapeProgress = constrain(diskMorph, 0, 1);
        let shapeEase = shapeProgress * shapeProgress *
          (3 - 2 * shapeProgress);
        let outerWeights = [0, 0.3, 0.65, 1, 1, 1, 1, 0.65, 0.3, 0];
        for (let pointIndex = 0; pointIndex < points.length; pointIndex++) {
          let diskAngle =
            -Math.PI / 2 + pointIndex / points.length * Math.PI * 2;
          let diskPoint = {
            x: diskCenter.x + Math.cos(diskAngle) * diskRadius,
            y: diskCenter.y + Math.sin(diskAngle) * diskRadius,
          };
          let shrinkAmount =
            shrinkEase * outerWeights[pointIndex] * 0.15;
          let contractedPoint = {
            x: lerp(
              points[pointIndex].x,
              innerAnchor.x,
              shrinkAmount,
            ),
            y: lerp(
              points[pointIndex].y,
              innerAnchor.y,
              shrinkAmount,
            ),
          };
          points[pointIndex] = {
            x: lerp(contractedPoint.x, diskPoint.x, shapeEase),
            y: lerp(contractedPoint.y, diskPoint.y, shapeEase),
          };
        }
      }
      let rgb = colorWheelPaletteRgb(tickHue);

      spokes.push({ points, rgb, selectionInfluence });
    }

    spokes.sort(
      (a, b) => a.selectionInfluence - b.selectionInfluence,
    );
    wheel.curveTightness(0.55);
    for (let spoke of spokes) {
      wheel.fill(
        spoke.rgb[0] * 255,
        spoke.rgb[1] * 255,
        spoke.rgb[2] * 255,
      );
      wheel.beginShape();
      for (let pointIndex = -1; pointIndex <= spoke.points.length + 1; pointIndex++) {
        let wrappedIndex = (
          pointIndex + spoke.points.length
        ) % spoke.points.length;
        let point = spoke.points[wrappedIndex];
        wheel.curveVertex(point.x, point.y);
      }
      wheel.endShape(CLOSE);
    }

    state.wheelTextureResolution = resolution;
    state.wheelTextureRotation = state.wheelRotation;
    state.wheelTextureHue = state.color.hue;
    state.wheelTextureDiskMorph = state.wheelDiskMorph;
  }

  return state.wheelTexture;
}

function drawColorPanel(color) {
  let state = scene.ui.colorPanel;
  updateColorWheelInertia();
  updateColorWheelDiskMorph();
  let panelVisible = colorPanelIsActive() && data.loading.ready;
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
  let composition = compositionBounds();
  let optionsLayout = texturePadLayout();
  let wheelX = optionsLayout.x;
  let wheelVisibleY = height / 2 - composition.y / 2;
  let wheelHiddenY = height / 2 + layout.wheelSize / 2;
  let wheelY = lerp(wheelHiddenY, wheelVisibleY, state.position);
  let wheelBounds = {
    x: wheelX,
    y: wheelY,
    w: layout.wheelSize,
    h: layout.wheelSize,
  };
  state.bounds = { wheel: wheelBounds };

  let wheelTexture = updateColorWheelTexture(layout);
  let pointerX = mouseX - width / 2;
  let pointerY = mouseY - height / 2;
  let shadowDirection = {
    x: wheelBounds.x - pointerX,
    y: wheelBounds.y - pointerY,
  };
  if (Math.hypot(shadowDirection.x, shadowDirection.y) > 1) {
    let targetShadowAngle = Math.atan2(
      shadowDirection.y,
      shadowDirection.x,
    );
    let shadowAngleDelta = Math.atan2(
      Math.sin(targetShadowAngle - state.wheelShadowAngle),
      Math.cos(targetShadowAngle - state.wheelShadowAngle),
    );
    state.wheelShadowAngle += shadowAngleDelta * 0.16;
  }
  let shadowDistance = 8 * scene.ui.scale;
  let shadowOffset = {
    x: Math.cos(state.wheelShadowAngle) * shadowDistance,
    y: Math.sin(state.wheelShadowAngle) * shadowDistance,
  };
  push();
  translate(0, 0, -6);
  resetShader();
  imageMode(CENTER);
  tint(0, 51);
  image(
    wheelTexture,
    wheelBounds.x + shadowOffset.x,
    wheelBounds.y + shadowOffset.y,
    wheelBounds.w,
    wheelBounds.h,
  );
  pop();

  push();
  translate(0, 0, -4);
  resetShader();
  imageMode(CENTER);
  tint(255, 255);
  image(
    wheelTexture,
    wheelBounds.x,
    wheelBounds.y,
    wheelBounds.w,
    wheelBounds.h,
  );
  pop();
}
