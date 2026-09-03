function requestPrintPreview(autoDownload = false) {
  let state = scene.ui.printPreview;
  if (
    state.pending ||
    state.open ||
    scene.session.mode != "active" ||
    scene.ui.backgroundPicker.open
  ) return false;

  state.pending = true;
  state.autoDownload = autoDownload;
  state.sessionGeneration = scene.session.generation;
  return true;
}

function resetPrintPreviewState() {
  let state = scene.ui.printPreview;
  state.pending = false;
  state.autoDownload = false;
  state.sessionGeneration = null;
  state.open = false;
  state.transition = 0;
  state.transitionTarget = 0;
  state.closing = false;
  state.completeSession = false;
  state.saveAsExample = false;
  state.snapshot = null;
  state.posterSnapshot = null;
  state.layers = [];
  state.introSpin.active = false;
  state.drag.active = false;
  state.snap.active = false;
}

function rejectPrintPreviewCapture(message) {
  console.warn(message);
  scene.ui.printPreview.pending = false;
  scene.ui.printPreview.autoDownload = false;
  scene.ui.printPreview.sessionGeneration = null;
  scene.ui.backgroundPicker.finalizing = false;
}

function cardPreviewSnapshot(image, fullResolution = false) {
  let bounds = compositionBounds();
  let scaleX = image.width / width;
  let scaleY = image.height / height;
  let snapshot = image.get(
    round(bounds.x * scaleX),
    round(bounds.y * scaleY),
    max(1, round(bounds.width * scaleX)),
    max(1, round(bounds.height * scaleY)),
  );
  if (fullResolution) {
    snapshot.resize(
      scene.composition.exportWidth,
      scene.composition.exportHeight,
    );
    return snapshot;
  }

  let maximumDimension = 768;
  let largestDimension = max(snapshot.width, snapshot.height);
  if (largestDimension > maximumDimension) {
    let scale = maximumDimension / largestDimension;
    snapshot.resize(
      max(1, round(snapshot.width * scale)),
      max(1, round(snapshot.height * scale)),
    );
  }
  return snapshot;
}

function setupCardPreviewCaptureBuffer() {
  let buffer = createGraphics(width, height, WEBGL);
  buffer.pixelDensity(1);
  buffer.smooth();
  buffer.angleMode(DEGREES);
  buffer.textFont(scene.text.font);
  buffer.textAlign(CENTER, CENTER);
  buffer.ortho();
  return buffer;
}

function clearCardPreviewCaptureBuffer(buffer) {
  buffer.clear();
  buffer.resetMatrix();
  buffer.ortho();
  buffer._renderer.GL.clear(
    buffer._renderer.GL.COLOR_BUFFER_BIT |
      buffer._renderer.GL.DEPTH_BUFFER_BIT,
  );
}

function posterExportBounds() {
  let poster = {
    x: 0,
    y: 0,
    width: scene.composition.exportWidth,
    height: scene.composition.exportHeight,
  };
  let cardWidth = poster.width * scene.creationCard.widthRatio;
  let cardHeight =
    cardWidth * scene.creationCard.height / scene.creationCard.width;
  if (cardHeight > poster.height) {
    cardHeight = poster.height;
    cardWidth =
      cardHeight * scene.creationCard.width / scene.creationCard.height;
  }
  return {
    poster,
    card: {
      x: (poster.width - cardWidth) / 2,
      y: (poster.height - cardHeight) / 2,
      width: cardWidth,
      height: cardHeight,
    },
  };
}

function mapPosterExportPoint(point, sourceCard, exportCard) {
  return {
    x: exportCard.x +
      ((point.x - sourceCard.x) / max(1, sourceCard.width)) * exportCard.width,
    y: exportCard.y +
      ((point.y - sourceCard.y) / max(1, sourceCard.height)) * exportCard.height,
  };
}

function clipPosterExportRoundedRect(context, bounds, radius) {
  let right = bounds.x + bounds.width;
  let bottom = bounds.y + bounds.height;
  let corner = min(radius, bounds.width / 2, bounds.height / 2);
  context.beginPath();
  context.moveTo(bounds.x + corner, bounds.y);
  context.lineTo(right - corner, bounds.y);
  context.quadraticCurveTo(right, bounds.y, right, bounds.y + corner);
  context.lineTo(right, bottom - corner);
  context.quadraticCurveTo(right, bottom, right - corner, bottom);
  context.lineTo(bounds.x + corner, bottom);
  context.quadraticCurveTo(bounds.x, bottom, bounds.x, bottom - corner);
  context.lineTo(bounds.x, bounds.y + corner);
  context.quadraticCurveTo(bounds.x, bounds.y, bounds.x + corner, bounds.y);
  context.closePath();
  context.clip();
}

function drawPosterExportPhoto(target, sourceCard, exportCard, scale) {
  let frame = scene.session.photoFrame;
  let photo = scene.session.photo;
  if (!frame.closed || frame.points.length < 3 || photo == null) return;

  let points = frame.points.map((point) =>
    mapPosterExportPoint(point, sourceCard, exportCard)
  );
  let placement = sessionPhotoPlacement(sourceCard);
  let mappedPlacement = {
    x: exportCard.x + (placement.x - sourceCard.x) * scale,
    y: exportCard.y + (placement.y - sourceCard.y) * scale,
    width: placement.width * scale,
    height: placement.height * scale,
  };
  let context = target.drawingContext;
  context.save();
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index++) {
    context.lineTo(points[index].x, points[index].y);
  }
  context.closePath();
  context.clip();
  context.drawImage(
    photo.canvas,
    mappedPlacement.x,
    mappedPlacement.y,
    mappedPlacement.width,
    mappedPlacement.height,
  );
  context.restore();

  let primaryColor = sessionPhotoFrameStrokeRgb();
  let secondaryColor = sessionPhotoFrameSecondaryStrokeRgb();
  let animatedPoints = frame.points.map((point, index) =>
    mapPosterExportPoint(
      animatedSessionPhotoFramePoint(frame.points, index, 17),
      sourceCard,
      exportCard,
    )
  );
  let pixelatedPoints = pixelatedSessionPhotoFramePoints(frame.points, 83).map(
    (point) => mapPosterExportPoint(point, sourceCard, exportCard),
  );
  target.push();
  target.noFill();
  target.strokeJoin(ROUND);
  target.strokeCap(ROUND);
  target.strokeWeight(max(2, 4 * scene.ui.scale * scale));
  target.stroke(primaryColor[0], primaryColor[1], primaryColor[2], 255);
  target.beginShape();
  for (let point of animatedPoints) target.vertex(point.x, point.y);
  target.endShape();
  target.stroke(secondaryColor[0], secondaryColor[1], secondaryColor[2], 255);
  target.beginShape();
  for (let point of pixelatedPoints) target.vertex(point.x, point.y);
  target.endShape();
  target.pop();
}

function drawPosterExportWord(
  target,
  word,
  path,
  wordIndex,
  textSizeValue,
  sourceCard,
  exportCard,
  scale,
) {
  let sourcePoints = boilingPath(textRenderBasePath(path));
  if (sourcePoints.length < 2 || word == "") return;
  let points = sourcePoints.map((point) =>
    mapPosterExportPoint(point, sourceCard, exportCard)
  );
  let lengths = buildLengths(points);
  if (lengths.length < 2) return;

  let total = lengths[lengths.length - 1];
  let glyphGroups = textGlyphGroupsForWord(
    wordIndex + 1,
    word.length,
    textureMixForWordIndex(wordIndex),
  );
  let exportTextSize = textSizeValue * scale;
  let pathEndMargin = min(exportTextSize * 0.35, total * 0.15);
  for (let index = 0; index < word.length; index++) {
    let distance = word.length > 1
      ? map(index, 0, word.length - 1, pathEndMargin, total - pathEndMargin)
      : total / 2;
    let point = pointOnPath(points, lengths, distance);
    let angleStep = max(1, total * 0.002);
    let before = pointOnPath(points, lengths, max(0, distance - angleStep));
    let after = pointOnPath(points, lengths, min(total, distance + angleStep));
    let angle = Math.atan2(after.y - before.y, after.x - before.x) * 180 / PI;
    let endpointDistance = min(index, word.length - 1 - index);
    angle *= constrain(map(endpointDistance, 0, 2, 0.35, 1), 0.35, 1);

    target.push();
    target.translate(point.x, point.y);
    target.rotate(angle);
    drawTextGlyphImage(
      target,
      word[index],
      exportTextSize,
      wordIndex * 1000 + index + 1,
      glyphGroups[index],
    );
    target.pop();
  }
}

function drawPosterExportOverlay(target, exportCard) {
  let state = scene.frameOverlay;
  if (state.artwork == null || state.textMask == null) return;
  let sourceInset = 2;
  target.push();
  target.noStroke();
  target.imageMode(CORNER);
  target.image(
    state.artwork,
    exportCard.x,
    exportCard.y,
    exportCard.width,
    exportCard.height,
    sourceInset,
    sourceInset,
    state.artwork.width - sourceInset * 2,
    state.artwork.height - sourceInset * 2,
  );
  let foregroundValue = lerp(29, 255, frameOverlayForegroundTarget());
  target.tint(foregroundValue);
  target.image(
    state.textMask,
    exportCard.x,
    exportCard.y,
    exportCard.width,
    exportCard.height,
    sourceInset,
    sourceInset,
    state.textMask.width - sourceInset * 2,
    state.textMask.height - sourceInset * 2,
  );
  target.noTint();
  target.pop();
}

function renderPosterExport() {
  let bounds = posterExportBounds();
  let sourceCard = creationCardBounds();
  let exportCard = bounds.card;
  let scale = exportCard.width / max(1, sourceCard.width);
  let target = createGraphics(bounds.poster.width, bounds.poster.height);
  target.pixelDensity(1);
  target.smooth();
  target.angleMode(DEGREES);
  target.textFont(scene.text.font);
  target.textAlign(CENTER, CENTER);
  target.clear();

  let backgroundIndex = Number.isInteger(scene.session.backgroundFrameIndex)
    ? scene.session.backgroundFrameIndex
    : 0;
  let exportBackground = scene.flowUi.exportBackgrounds?.[backgroundIndex];
  let backgroundAsset = scene.flowUi.backgrounds[backgroundIndex];
  if (exportBackground?.complete && exportBackground.naturalWidth > 1) {
    target.drawingContext.drawImage(
      exportBackground,
      0,
      0,
      bounds.poster.width,
      bounds.poster.height,
    );
  } else if (backgroundAsset?.width > 1 && backgroundAsset?.height > 1) {
    target.imageMode(CORNER);
    target.image(
      backgroundAsset,
      0,
      0,
      bounds.poster.width,
      bounds.poster.height,
    );
  }
  target.noStroke();
  target.fill(0, PLAYSPACE_BACKGROUND_DIM_ALPHA);
  target.rect(0, 0, bounds.poster.width, bounds.poster.height);

  let context = target.drawingContext;
  let radius = creationCardCornerRadius(exportCard);
  context.save();
  clipPosterExportRoundedRect(context, exportCard, radius);
  let rgb = sessionBackgroundRgb();
  target.noStroke();
  target.fill(rgb[0] * 255, rgb[1] * 255, rgb[2] * 255);
  target.rect(exportCard.x, exportCard.y, exportCard.width, exportCard.height);

  let creationCard = creationCardBounds();
  let baseTextSize = min(creationCard.width, creationCard.height) / 4;
  let order = syncLayerOrder();
  for (let key of order) {
    let item = layerItemForKey(key);
    if (item == null) continue;
    if (item.type == "photo") {
      drawPosterExportPhoto(target, sourceCard, exportCard, scale);
      continue;
    }
    let path = textPathForWordIndex(item.wordIndex);
    if (path == null) continue;
    drawPosterExportWord(
      target,
      textWords()[item.wordIndex],
      path,
      item.wordIndex,
      textSizeForWordIndex(item.wordIndex, baseTextSize),
      sourceCard,
      exportCard,
      scale,
    );
  }
  drawPosterExportOverlay(target, exportCard);
  context.restore();
  return target.get();
}

function captureCardPreviewLayers(liveBaseSnapshot) {
  let state = scene.ui.printPreview;
  let originalWorkspace = scene.workspace;
  let captureBuffer = setupCardPreviewCaptureBuffer();
  let baseSnapshot = null;
  let posterSnapshot = renderPosterExport();
  let layers = [];

  try {
    scene.workspace = captureBuffer;
    clearCardPreviewCaptureBuffer(captureBuffer);
    captureBuffer.push();
    captureBuffer.resetMatrix();
    captureBuffer.imageMode(CENTER);
    let bounds = compositionBounds();
    captureBuffer.image(
      liveBaseSnapshot,
      0,
      0,
      bounds.width,
      bounds.height,
    );
    captureBuffer.pop();
    baseSnapshot = cardPreviewSnapshot(captureBuffer);

    let creationCard = creationCardBounds();
    let baseTextSize = min(creationCard.width, creationCard.height) / 4;
    let order = syncLayerOrder();
    for (let key of order) {
      let item = layerItemForKey(key);
      if (item == null) continue;
      clearCardPreviewCaptureBuffer(captureBuffer);
      if (item.type == "photo") {
        drawSessionPhoto(0);
      } else {
        let path = textPathForWordIndex(item.wordIndex);
        if (path == null) continue;
        drawWordOnTextPath(
          textWords()[item.wordIndex],
          path,
          textSizeForWordIndex(item.wordIndex, baseTextSize),
          item.wordIndex,
          0,
        );
      }
      layers.push({
        key,
        type: item.type,
        snapshot: cardPreviewSnapshot(captureBuffer),
      });
    }

    clearCardPreviewCaptureBuffer(captureBuffer);
    drawFrameOverlay(captureBuffer, 0);
    layers.push({
      key: "frame-overlay",
      type: "overlay",
      snapshot: cardPreviewSnapshot(captureBuffer),
    });
  } finally {
    scene.workspace = originalWorkspace;
  }

  state.snapshot = baseSnapshot;
  state.posterSnapshot = posterSnapshot;
  state.layers = layers;
}

function capturePrintPreview(liveBaseSnapshot) {
  let state = scene.ui.printPreview;
  if (!state.pending) return;

  if (
    state.sessionGeneration != scene.session.generation ||
    scene.session.mode != "active" ||
    scene.ui.backgroundPicker.open ||
    !scene.ui.backgroundPicker.finalizing ||
    liveBaseSnapshot == null
  ) {
    rejectPrintPreviewCapture(
      "Cancelled a stale PlaySpace poster capture before it could include another scene.",
    );
    return;
  }

  try {
    captureCardPreviewLayers(liveBaseSnapshot);
  } catch (error) {
    rejectPrintPreviewCapture("Unable to capture the final PlaySpace poster.");
    console.error(error);
    return;
  }
  state.pending = false;
  state.sessionGeneration = null;
  if (state.autoDownload) {
    let captureGeneration = scene.session.generation;
    state.autoDownload = false;
    state.open = false;
    state.transition = 0;
    state.transitionTarget = 0;
    let saveAsExample = scene.secretSession.recording;
    captureCurrentCreationRecipe();
    if (saveAsExample) {
      saveSpecialSessionExample(state.posterSnapshot)
        .then(() => {
          if (captureGeneration != scene.session.generation) return;
          scene.ui.backgroundPicker.finalizing = false;
          finishPlaySession();
        })
        .catch((error) => {
          if (captureGeneration != scene.session.generation) return;
          console.error("Unable to save PlaySpace example", error);
          scene.ui.backgroundPicker.finalizing = false;
          scene.secretSession.recording = true;
          scene.session.mode = "active";
          setTextEdit(false);
        });
    } else {
      beginDownloadHandoff(state.posterSnapshot);
      scene.ui.backgroundPicker.finalizing = false;
    }
    return;
  }
  scene.ui.backgroundPicker.finalizing = false;
  state.open = true;
  state.transition = 0;
  state.transitionTarget = 1;
  state.closing = false;
  state.completeSession = false;
  state.saveAsExample = false;
  state.introSpin.active = true;
  state.introSpin.startedAt = millis();
  state.rotation.x = 0;
  state.rotation.y = 0;
  state.velocity.x = 0;
  state.velocity.y = 0;
  state.snap.active = false;
}

function closePrintPreview(completeSession = false) {
  let state = scene.ui.printPreview;
  state.transitionTarget = 0;
  state.closing = true;
  state.introSpin.active = false;
  state.completeSession = state.completeSession || completeSession;
  state.drag.active = false;
  state.snap.active = false;
  scene.ui.pointer.pressTarget = null;
  scene.ui.pointer.pressStartedOnButton = false;
}

function beginPrintPreviewDrag() {
  let state = scene.ui.printPreview;
  state.introSpin.active = false;
  state.snap.active = false;
  state.drag.active = true;
  state.drag.moved = false;
  state.drag.lastX = mouseX;
  state.drag.lastY = mouseY;
  state.drag.lastTime = millis();
  state.velocity.x = 0;
  state.velocity.y = 0;
}

function updatePrintPreviewDrag() {
  let state = scene.ui.printPreview;
  if (!state.drag.active) return;

  let deltaX = mouseX - state.drag.lastX;
  let deltaY = mouseY - state.drag.lastY;
  let now = millis();
  let elapsed = max(1, now - state.drag.lastTime) / 1000;
  let rotationScale = 0.32 / max(0.75, scene.ui.scale);

  if (abs(deltaX) + abs(deltaY) > 1) {
    state.drag.moved = true;
    state.rotation.y += deltaX * rotationScale;
    state.rotation.x -= deltaY * rotationScale;
    state.velocity.y = lerp(
      state.velocity.y,
      constrain((deltaX * rotationScale) / elapsed, -720, 720),
      0.65,
    );
    state.velocity.x = lerp(
      state.velocity.x,
      constrain((-deltaY * rotationScale) / elapsed, -720, 720),
      0.65,
    );
    state.drag.lastX = mouseX;
    state.drag.lastY = mouseY;
    state.drag.lastTime = now;
  }
}

function endPrintPreviewDrag() {
  let state = scene.ui.printPreview;
  if (!state.drag.active) return;

  updatePrintPreviewDrag();
  state.drag.active = false;
  if (!state.drag.moved) closePrintPreview();
}

function updatePrintPreviewInertia() {
  let state = scene.ui.printPreview;
  if (state.drag.active) return;

  if (state.introSpin.active) {
    let progress = constrain(
      (millis() - state.introSpin.startedAt) /
        (state.introSpin.duration * 1000),
      0,
      1,
    );
    let eased =
      progress * progress * progress *
      (progress * (progress * 6 - 15) + 10);
    state.rotation.x = -8 * sin(progress * 180);
    state.rotation.y = eased * 360;
    state.velocity.x = 0;
    state.velocity.y = 0;
    if (progress >= 1) {
      state.introSpin.active = false;
      state.rotation.x = 0;
      state.rotation.y = 360;
      state.snap.active = false;
    }
    return;
  }

  let elapsed = min(deltaTime / 1000, 0.05);
  if (state.snap.active) {
    let smooth = 1 - pow(1 - state.snap.smooth, elapsed * 60);
    state.rotation.x = lerp(
      state.rotation.x,
      state.snap.targetX,
      smooth,
    );
    state.rotation.y = lerp(
      state.rotation.y,
      state.snap.targetY,
      smooth,
    );

    if (
      abs(state.rotation.x - state.snap.targetX) < 0.1 &&
      abs(state.rotation.y - state.snap.targetY) < 0.1
    ) {
      let backFacing = abs(round(state.snap.targetY / 180)) % 2 == 1;
      state.rotation.x = 0;
      state.rotation.y = backFacing ? 180 : 0;
      state.snap.active = false;
    }
    return;
  }

  state.rotation.x += state.velocity.x * elapsed;
  state.rotation.y += state.velocity.y * elapsed;
  let damping = pow(0.985, elapsed * 60);
  state.velocity.x *= damping;
  state.velocity.y *= damping;

  if (abs(state.velocity.x) < 0.01) state.velocity.x = 0;
  if (abs(state.velocity.y) < 0.01) state.velocity.y = 0;

  if (
    Math.hypot(state.velocity.x, state.velocity.y) <
    state.snap.velocityThreshold
  ) {
    state.velocity.x = 0;
    state.velocity.y = 0;
    state.snap.targetX = round(state.rotation.x / 360) * 360;
    state.snap.targetY = round(state.rotation.y / 180) * 180;
    state.snap.active = true;
  }
}

function drawCardPreviewStickerShadow(
  snapshot,
  widthValue,
  heightValue,
  shadowDepth,
) {
  push();
  translate(2, 3, shadowDepth);
  noStroke();
  tint(0, 55);
  textureMode(NORMAL);
  texture(snapshot);
  plane(widthValue, heightValue);
  noTint();
  pop();
}

function drawCardPreviewSticker(snapshot, widthValue, heightValue, depth) {
  push();
  translate(0, 0, depth);
  noStroke();
  textureMode(NORMAL);
  texture(snapshot);
  plane(widthValue, heightValue);
  pop();
}

function drawPrintPreviewBack(
  paperWidth,
  paperHeight,
  paperRadius,
  contentWidth,
  contentHeight,
  contentRadius,
) {
  let selectedIndex = Number.isInteger(scene.session.backgroundFrameIndex)
    ? scene.session.backgroundFrameIndex
    : 0;
  let background = scene.flowUi.cardBackBackgrounds[selectedIndex] ||
    scene.flowUi.cardBackBackgrounds[0] ||
    scene.flowUi.backgrounds[selectedIndex];
  let artwork = cardBackArtworkForBackground(selectedIndex);

  fill(255);
  rectMode(CENTER);
  rect(0, 0, paperWidth, paperHeight, paperRadius);

  push();
  translate(0, 0, -0.75);
  rotateY(180);
  noStroke();
  textureMode(NORMAL);
  if (background?.width > 1 && background?.height > 1) {
    let sourceAspect = background.width / background.height;
    let targetAspect = contentWidth / contentHeight;
    let uInset = sourceAspect > targetAspect
      ? (1 - targetAspect / sourceAspect) / 2
      : 0;
    let vInset = sourceAspect < targetAspect
      ? (1 - sourceAspect / targetAspect) / 2
      : 0;
    texture(background);
    beginShape();
    vertex(-contentWidth / 2, -contentHeight / 2, 0, uInset, vInset);
    vertex(contentWidth / 2, -contentHeight / 2, 0, 1 - uInset, vInset);
    vertex(contentWidth / 2, contentHeight / 2, 0, 1 - uInset, 1 - vInset);
    vertex(-contentWidth / 2, contentHeight / 2, 0, uInset, 1 - vInset);
    endShape(CLOSE);
  } else {
    fill(200);
    rect(0, 0, contentWidth, contentHeight, contentRadius);
  }
  if (artwork?.width > 1 && artwork?.height > 1) {
    translate(0, 0, 0.02);
    texture(artwork);
    rect(0, 0, contentWidth, contentHeight, contentRadius);
  }
  pop();
}

function drawPrintPreviewPlane(
  snapshot,
  layers,
  paperWidth,
  paperHeight,
  contentWidth,
  contentHeight,
  planeY,
) {
  let state = scene.ui.printPreview;
  let frontFacing =
    cos(state.rotation.x) * cos(state.rotation.y) >= 0;
  let paperRadius = min(paperWidth, paperHeight) *
    scene.composition.cornerRadius;
  let contentInset = max(
    (paperWidth - contentWidth) / 2,
    (paperHeight - contentHeight) / 2,
  );
  let contentRadius = max(0, paperRadius - contentInset);

  push();
  translate(0, planeY, 0);
  rotateX(state.rotation.x);
  rotateY(state.rotation.y);
  noStroke();

  if (frontFacing) {
    let cardSurfaceDepth = 0.75;
    fill(255);
    rectMode(CENTER);
    rect(0, 0, paperWidth, paperHeight, paperRadius);
    translate(0, 0, cardSurfaceDepth);
    textureMode(NORMAL);
    texture(snapshot);
    rect(0, 0, contentWidth, contentHeight, contentRadius);
    let layerGap = state.depthTotal / max(1, layers.length);
    _renderer.GL.depthMask(false);
    for (let index = 0; index < layers.length; index++) {
      if (layers[index].type == "overlay") continue;
      drawCardPreviewStickerShadow(
        layers[index].snapshot,
        contentWidth,
        contentHeight,
        0.01,
      );
    }
    _renderer.GL.depthMask(true);
    for (let index = 0; index < layers.length; index++) {
      drawCardPreviewSticker(
        layers[index].snapshot,
        contentWidth,
        contentHeight,
        0.9 + layerGap * (index + 1),
      );
    }
  } else {
    drawPrintPreviewBack(
      paperWidth,
      paperHeight,
      paperRadius,
      contentWidth,
      contentHeight,
      contentRadius,
    );
  }
  pop();
}

function printPreviewPaperSize(snapshotAspect) {
  let scale = scene.ui.scale;
  let maximumWidth = max(120 * scale, width - 140 * scale);
  let maximumHeight = max(180 * scale, height - 170 * scale);
  let paperWidth;
  let paperHeight;
  let contentWidth;
  let contentHeight;

  if (snapshotAspect >= 1) {
    paperHeight = 1;
    contentHeight = 0.96;
    contentWidth = contentHeight * snapshotAspect;
    paperWidth = contentWidth + 0.04;
  } else {
    paperWidth = 1;
    contentWidth = 0.96;
    contentHeight = contentWidth / snapshotAspect;
    paperHeight = contentHeight + 0.04;
  }

  let fitScale = min(
    maximumWidth / paperWidth,
    maximumHeight / paperHeight,
  );
  return {
    width: paperWidth * fitScale,
    height: paperHeight * fitScale,
    contentWidth: contentWidth * fitScale,
    contentHeight: contentHeight * fitScale,
  };
}

function drawPrintPreview() {
  let state = scene.ui.printPreview;
  if (!state.open || state.snapshot == null) return;

  state.transition = animateData(
    state.transition,
    state.transitionTarget,
    0.16,
  );
  if (state.closing && state.transition < 0.01) {
    let completeSession = state.completeSession;
    let saveAsExample = state.saveAsExample;
    let completedPosterSnapshot = state.posterSnapshot;
    state.transition = 0;
    state.open = false;
    state.closing = false;
    state.completeSession = false;
    state.saveAsExample = false;
    state.snapshot = null;
    state.posterSnapshot = null;
    state.layers = [];
    if (completeSession) {
      if (saveAsExample) {
        saveSpecialSessionExample(completedPosterSnapshot)
          .then(() => finishPlaySession())
          .catch((error) => {
            console.error("Unable to save PlaySpace example", error);
            scene.secretSession.recording = true;
            scene.session.mode = "active";
            setTextEdit(false);
          });
      } else {
        beginDownloadHandoff(completedPosterSnapshot);
      }
    } else {
      scene.session.mode = "active";
      setTextEdit(true);
      saveTextMemory();
    }
    return;
  }

  updatePrintPreviewInertia();

  let scale = scene.ui.scale;
  let padding = scene.ui.button.padding * scale;
  let buttonHeight = scene.ui.button.height * scale;
  let buttonWidth = scene.ui.button.width * scale;
  let snapshotAspect = state.snapshot.width / state.snapshot.height;
  let paperSize = printPreviewPaperSize(snapshotAspect);

  let buttonVisibleY = uiSafeBottomY(padding + buttonHeight / 2);
  let buttonHiddenY = uiHiddenBottomY(buttonHeight, padding);
  let buttonY = lerp(buttonHiddenY, buttonVisibleY, state.transition);
  let buttonGap = padding / 2;
  let cancelX = -buttonGap / 2 - buttonWidth / 2;
  let okX = buttonGap / 2 + buttonWidth / 2;
  let planeHiddenY = uiHiddenBottomY(paperSize.height / 2, padding);
  let planeVisibleY = -44 * scale;
  let planeY = lerp(planeHiddenY, planeVisibleY, state.transition);

  push();
  translate(0, 0, 128);
  resetShader();
  _renderer.GL.disable(_renderer.GL.CULL_FACE);
  _renderer.GL.clear(_renderer.GL.DEPTH_BUFFER_BIT);
  imageMode(CENTER);
  image(homeGradientBuffer(), 0, 0, width, height);
  _renderer.GL.clear(_renderer.GL.DEPTH_BUFFER_BIT);

  perspective(60, width / height, 10, 5000);
  push();
  translate(0, 0, 64);
  ambientLight(195);
  pointLight(
    60,
    60,
    60,
    -width * 0.28,
    -height * 0.32,
    650,
  );
  drawPrintPreviewPlane(
    state.snapshot,
    state.layers,
    paperSize.width,
    paperSize.height,
    paperSize.contentWidth,
    paperSize.contentHeight,
    planeY,
  );
  pop();
  ortho();
  _renderer.GL.clear(_renderer.GL.DEPTH_BUFFER_BIT);
  _renderer.GL.disable(_renderer.GL.CULL_FACE);

  scene.gui.printCancel.armed =
    scene.ui.pointer.pressTarget == "printCancel";
  drawFlowSliceButton(
    scene.gui.printCancel,
    "cancel",
    cancelX,
    buttonY,
    buttonWidth * 1.2,
    buttonHeight * 1.2,
  );

  scene.gui.printOk.armed = scene.ui.pointer.pressTarget == "printOk";
  drawFlowSliceButton(
    scene.gui.printOk,
    "finishTeal",
    okX,
    buttonY,
    buttonWidth * 1.2,
    buttonHeight * 1.2,
  );

  pop();
}
