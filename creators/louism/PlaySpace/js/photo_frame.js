function photoFramePathWithoutDuplicate(points) {
  let path = points.map((point) => createVector(point.x, point.y));
  if (
    path.length > 1 &&
    dist(path[0].x, path[0].y, path[path.length - 1].x, path[path.length - 1].y) <
      0.001
  ) {
    path.pop();
  }
  return path;
}

function resampleClosedPhotoFramePath(points, sampleCount = 96) {
  let path = photoFramePathWithoutDuplicate(points);
  if (path.length < 2) return path;

  let segmentLengths = [];
  let totalLength = 0;
  for (let i = 0; i < path.length; i++) {
    let next = path[(i + 1) % path.length];
    let length = dist(path[i].x, path[i].y, next.x, next.y);
    segmentLengths.push(length);
    totalLength += length;
  }
  if (totalLength <= 0.001) return path;

  let samples = [];
  let segmentIndex = 0;
  let segmentStartDistance = 0;
  for (let i = 0; i < sampleCount; i++) {
    let targetDistance = (i / sampleCount) * totalLength;
    while (
      segmentIndex < segmentLengths.length - 1 &&
      targetDistance > segmentStartDistance + segmentLengths[segmentIndex]
    ) {
      segmentStartDistance += segmentLengths[segmentIndex];
      segmentIndex++;
    }
    let start = path[segmentIndex];
    let end = path[(segmentIndex + 1) % path.length];
    let length = max(0.001, segmentLengths[segmentIndex]);
    let progress = constrain(
      (targetDistance - segmentStartDistance) / length,
      0,
      1,
    );
    samples.push(
      createVector(
        lerp(start.x, end.x, progress),
        lerp(start.y, end.y, progress),
      ),
    );
  }
  return samples;
}

function smoothClosedPhotoFramePath(points) {
  let path = resampleClosedPhotoFramePath(points, 96);
  let smoothed = [];
  for (let i = 0; i < path.length; i++) {
    let point = path[i];
    let next = path[(i + 1) % path.length];
    smoothed.push(
      createVector(
        point.x * 0.75 + next.x * 0.25,
        point.y * 0.75 + next.y * 0.25,
      ),
    );
    smoothed.push(
      createVector(
        point.x * 0.25 + next.x * 0.75,
        point.y * 0.25 + next.y * 0.75,
      ),
    );
  }
  smoothed.push(smoothed[0].copy());
  return smoothed;
}

function resetSessionPhotoFrame() {
  let frame = scene.session.photoFrame;
  frame.points = [];
  frame.photoPlacement = null;
  frame.layoutNormalized = false;
  frame.drawing = false;
  frame.closed = false;
  frame.dirty = true;
  frame.transition = 0;
  frame.reviewTransition = 0;
  frame.startedAt = null;
  frame.deadlineAt = null;
  frame.timeoutHandled = false;
  frame.cursor.x = null;
  frame.cursor.y = null;
  frame.cursor.lastMovedAt = 0;
  frame.cursor.textMix = 0;
  frame.faceAdjustment = null;
  frame.faceRequestId = -1;
}

function startSessionPhotoFrameStage() {
  let frame = scene.session.photoFrame;
  frame.startedAt = millis();
  frame.deadlineAt = Date.now() + frame.durationSeconds * 1000;
  frame.timeoutHandled = false;
  frame.cursor.x = mouseX;
  frame.cursor.y = mouseY;
  frame.cursor.lastMovedAt = millis();
  frame.cursor.textMix = 0;
}

function sessionPhotoFrameTimerLabel() {
  let frame = scene.session.photoFrame;
  let remaining = Number.isFinite(frame.deadlineAt)
    ? max(0, ceil((frame.deadlineAt - Date.now()) / 1000))
    : frame.durationSeconds;
  return `${floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;
}

function updateSessionCreationTimeout() {
  let frame = scene.session.photoFrame;
  if (
    frame.timeoutHandled ||
    !Number.isFinite(frame.deadlineAt) ||
    !["frame", "active"].includes(scene.session.mode) ||
    Date.now() < frame.deadlineAt
  ) return;

  frame.timeoutHandled = true;
  if (scene.session.mode == "active") {
    setTextEdit(false);
    openBackgroundFramePicker();
    return;
  }
  if (frame.closed) {
    acceptSessionPhotoFrame();
    setTextEdit(false);
    openBackgroundFramePicker();
    return;
  }
  let card = creationCardBounds();
  let inset = min(card.width, card.height) * 0.045;
  frame.points = [
    createVector(card.x + inset, card.y + inset),
    createVector(card.x + card.width - inset, card.y + inset),
    createVector(card.x + card.width - inset, card.y + card.height - inset),
    createVector(card.x + inset, card.y + card.height - inset),
    createVector(card.x + inset, card.y + inset),
  ];
  frame.closed = true;
  frame.dirty = true;
  acceptSessionPhotoFrame();
  setTextEdit(false);
  openBackgroundFramePicker();
}

function sessionPhotoFrameLength() {
  let points = scene.session.photoFrame.points;
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += dist(
      points[i - 1].x,
      points[i - 1].y,
      points[i].x,
      points[i].y,
    );
  }
  return length;
}

function appendSessionPhotoFramePoint(x, y, force = false) {
  let frame = scene.session.photoFrame;
  let point = constrainPointToCreationCard(x, y);
  let previous = frame.points[frame.points.length - 1];
  let minimumDistance = frame.sampleDistance * scene.ui.scale;
  if (
    force ||
    previous == null ||
    dist(previous.x, previous.y, point.x, point.y) >= minimumDistance
  ) {
    frame.points.push(point);
    frame.dirty = true;
    scheduleSessionCacheSave();
  }
}

function beginPhotoFrameGesture() {
  if (
    scene.session.mode != "frame" ||
    scene.session.photoFrame.closed ||
    scene.session.cameraPrompt.exitConfirming ||
    scene.session.cameraPrompt.exitTransition > 0.05
  ) {
    return false;
  }
  if (!pointInsideCreationCard(mouseX, mouseY)) return false;

  let frame = scene.session.photoFrame;
  frame.cursor.lastMovedAt = millis();
  frame.drawing = true;
  appendSessionPhotoFramePoint(mouseX, mouseY, frame.points.length == 0);
  return true;
}

function updatePhotoFrameGesture() {
  let frame = scene.session.photoFrame;
  if (scene.session.mode != "frame" || !frame.drawing) return false;

  appendSessionPhotoFramePoint(mouseX, mouseY);
  return true;
}

function jitterCloseSessionPhotoFrame() {
  let frame = scene.session.photoFrame;
  let start = frame.points[0];
  let end = frame.points[frame.points.length - 1];
  let closingDistance = dist(end.x, end.y, start.x, start.y);
  let stepLength = max(6, 10 * scene.ui.scale);
  let steps = max(2, ceil(closingDistance / stepLength));
  let dx = start.x - end.x;
  let dy = start.y - end.y;
  let magnitude = max(1, sqrt(dx * dx + dy * dy));
  let normalX = -dy / magnitude;
  let normalY = dx / magnitude;
  let jitterAmount = min(4 * scene.ui.scale, closingDistance * 0.08);

  for (let i = 1; i < steps; i++) {
    let progress = i / steps;
    let alternate = i % 2 == 0 ? -1 : 1;
    let jitter =
      alternate * jitterAmount * sin(progress * 180) * random(0.35, 1);
    frame.points.push(
      constrainPointToCreationCard(
        lerp(end.x, start.x, progress) + normalX * jitter,
        lerp(end.y, start.y, progress) + normalY * jitter,
      ),
    );
  }
  frame.points.push(start.copy());
}

function endPhotoFrameGesture() {
  let frame = scene.session.photoFrame;
  if (scene.session.mode != "frame" || !frame.drawing) return false;

  appendSessionPhotoFramePoint(mouseX, mouseY, true);
  frame.drawing = false;
  frame.cursor.lastMovedAt = millis();
  let start = frame.points[0];
  let end = frame.points[frame.points.length - 1];
  let canClose =
    frame.points.length >= frame.minimumPoints &&
    sessionPhotoFrameLength() >= frame.minimumLength * scene.ui.scale &&
    dist(start.x, start.y, end.x, end.y) <=
      frame.closeRadius * scene.ui.scale;

  if (canClose) {
    jitterCloseSessionPhotoFrame();
    let smoothedPoints = smoothClosedPhotoFramePath(frame.points);
    let drawnPoints = resampleClosedPhotoFramePath(smoothedPoints, 128);
    drawnPoints.push(drawnPoints[0].copy());
    frame.points = drawnPoints;
    frame.faceAdjustment = null;
    frame.closed = true;
    frame.dirty = true;
    scheduleSessionCacheSave();
  }
  return true;
}

function updateSessionPhotoFrameFaceAdjustment() {
  let frame = scene.session.photoFrame;
  let adjustment = frame.faceAdjustment;
  if (adjustment == null || !adjustment.active) return;

  let progress = (millis() - adjustment.startedAt) / 1000 / adjustment.duration;
  if (progress >= 1) {
    frame.points = adjustment.target.map((point) => point.copy());
    frame.faceAdjustment.active = false;
    frame.dirty = true;
    scheduleSessionCacheSave();
    return;
  }

  progress = constrain(progress, 0, 1);
  let eased = progress * progress * (3 - 2 * progress);
  let count = min(adjustment.source.length, adjustment.target.length) - 1;
  frame.points = [];
  for (let i = 0; i < count; i++) {
    frame.points.push(
      createVector(
        lerp(adjustment.source[i].x, adjustment.target[i].x, eased),
        lerp(adjustment.source[i].y, adjustment.target[i].y, eased),
      ),
    );
  }
  frame.points.push(frame.points[0].copy());
  frame.dirty = true;
}

function redrawSessionPhotoFrame() {
  if (scene.session.mode != "frame") return;
  let startedAt = scene.session.photoFrame.startedAt;
  let deadlineAt = scene.session.photoFrame.deadlineAt;
  resetSessionPhotoFrame();
  scene.session.photoFrame.startedAt = startedAt;
  scene.session.photoFrame.deadlineAt = deadlineAt;
  scheduleSessionCacheSave();
}

function acceptSessionPhotoFrame() {
  let frame = scene.session.photoFrame;
  if (scene.session.mode != "frame" || !frame.closed) return;
  freezeSessionPhotoFrameLayout();
  scene.ui.pointer.pressTarget = null;
  scene.ui.pointer.pressStartedOnButton = false;
  setTextEdit(true);
  scene.session.mode = "active";
  resetEditorHistory();
  saveTextMemory();
  scheduleSessionCacheSave();
}

function sessionPhotoFrameBounds(points = scene.session.photoFrame.points) {
  if (points.length == 0) return null;

  let left = points[0].x;
  let right = points[0].x;
  let top = points[0].y;
  let bottom = points[0].y;
  for (let point of points) {
    left = min(left, point.x);
    right = max(right, point.x);
    top = min(top, point.y);
    bottom = max(bottom, point.y);
  }

  let frameWidth = max(1, right - left);
  let frameHeight = max(1, bottom - top);
  let size = max(frameWidth, frameHeight);
  return {
    left,
    right,
    top,
    bottom,
    width: frameWidth,
    height: frameHeight,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
    size,
  };
}

function sessionPhotoPlacement(bounds = creationCardBounds()) {
  let frame = scene.session.photoFrame;
  if (frame.photoPlacement != null) return frame.photoPlacement;
  let photo = scene.session.photo;
  if (photo == null) return null;

  let scale = max(bounds.width / photo.width, bounds.height / photo.height);
  let photoWidth = photo.width * scale;
  let photoHeight = photo.height * scale;
  return {
    x: bounds.x + bounds.width / 2 - photoWidth / 2,
    y: bounds.y + bounds.height / 2 - photoHeight / 2,
    width: photoWidth,
    height: photoHeight,
  };
}

function freezeSessionPhotoFrameLayout() {
  let frame = scene.session.photoFrame;
  let placement = sessionPhotoPlacement();
  if (frame.layoutNormalized || placement == null) return;
  frame.photoPlacement = { ...placement };
  frame.layoutNormalized = true;
  frame.dirty = true;
}

function normalizeSessionPhotoFrameLayout() {
  freezeSessionPhotoFrameLayout();
}

function sessionPhotoFramePathsDiffer(first, second, threshold = 0.25) {
  if (first.length != second.length) return true;
  for (let i = 0; i < first.length; i++) {
    if (dist(first[i].x, first[i].y, second[i].x, second[i].y) > threshold) {
      return true;
    }
  }
  return false;
}

function sessionPhotoFaceEllipses(points) {
  let detection = scene.session.faceDetection;
  let photo = scene.session.photo;
  let bounds = sessionPhotoFrameBounds(points);
  if (
    detection.status != "ready" ||
    photo == null ||
    bounds == null ||
    detection.boxes.length == 0
  ) {
    return [];
  }

  let placement = sessionPhotoPlacement();
  if (placement == null) return [];
  let protectedFaceRatio = 0.75;
  return detection.boxes.map((box) => {
    let faceWidth = box.width * placement.width;
    let faceHeight = box.height * placement.height;
    return {
      centerX: placement.x + (box.x + box.width / 2) * placement.width,
      centerY: placement.y + (box.y + box.height / 2) * placement.height,
      radiusX: faceWidth * 0.5 * protectedFaceRatio,
      radiusY: faceHeight * 0.5 * protectedFaceRatio,
    };
  });
}

function projectPhotoFramePointOutsideFace(point, face, fallbackAngle) {
  let dx = point.x - face.centerX;
  let dy = point.y - face.centerY;
  let nx = dx / face.radiusX;
  let ny = dy / face.radiusY;
  let normalizedDistance = sqrt(nx * nx + ny * ny);
  if (normalizedDistance >= 1) return point.copy();

  if (normalizedDistance < 0.001) {
    dx = Math.cos(fallbackAngle) * face.radiusX;
    dy = Math.sin(fallbackAngle) * face.radiusY;
    normalizedDistance = 1;
  }
  let clearance = 2 * scene.ui.scale;
  let scale =
    1 / max(0.001, normalizedDistance) +
    clearance / max(face.radiusX, face.radiusY);
  return createVector(face.centerX + dx * scale, face.centerY + dy * scale);
}

function featherPhotoFrameFaceDisplacements(source, projected) {
  let count = source.length - 1;
  let displacement = [];
  for (let i = 0; i < count; i++) {
    displacement.push(
      createVector(
        projected[i].x - source[i].x,
        projected[i].y - source[i].y,
      ),
    );
  }

  for (let pass = 0; pass < 2; pass++) {
    let smoothed = [];
    for (let i = 0; i < count; i++) {
      let previous = displacement[(i - 1 + count) % count];
      let current = displacement[i];
      let next = displacement[(i + 1) % count];
      smoothed.push(
        createVector(
          previous.x * 0.2 + current.x * 0.6 + next.x * 0.2,
          previous.y * 0.2 + current.y * 0.6 + next.y * 0.2,
        ),
      );
    }
    displacement = smoothed;
  }

  let result = [];
  for (let i = 0; i < count; i++) {
    result.push(
      createVector(
        source[i].x + displacement[i].x,
        source[i].y + displacement[i].y,
      ),
    );
  }
  result.push(result[0].copy());
  return result;
}

function protectSessionPhotoFrameFromFaces(points) {
  let faces = sessionPhotoFaceEllipses(points);
  if (faces.length == 0 || points.length < 3) {
    return points.map((point) => point.copy());
  }

  let source = points.map((point) => point.copy());
  let protectedPoints = source.map((point) => point.copy());
  let count = source.length - 1;
  for (let face of faces) {
    for (let i = 0; i < count; i++) {
      protectedPoints[i] = projectPhotoFramePointOutsideFace(
        protectedPoints[i],
        face,
        (i / count) * TWO_PI,
      );
    }
    protectedPoints[count] = protectedPoints[0].copy();
  }

  protectedPoints = featherPhotoFrameFaceDisplacements(source, protectedPoints);
  for (let face of faces) {
    for (let i = 0; i < count; i++) {
      protectedPoints[i] = projectPhotoFramePointOutsideFace(
        protectedPoints[i],
        face,
        (i / count) * TWO_PI,
      );
    }
    protectedPoints[count] = protectedPoints[0].copy();
  }
  return protectedPoints;
}

function applyDetectedFacesToSessionPhotoFrame() {
  let frame = scene.session.photoFrame;
  let detection = scene.session.faceDetection;
  if (
    detection.status != "ready" ||
    !frame.closed ||
    frame.faceRequestId == detection.requestId
  ) {
    return;
  }
  frame.faceRequestId = detection.requestId;
}

function animatedSessionPhotoFramePoint(points, index, seed = 0) {
  let count = points.length;
  if (
    count > 1 &&
    dist(points[0].x, points[0].y, points[count - 1].x, points[count - 1].y) <
      0.001
  ) {
    count--;
  }
  let pointIndex = index % count;
  let point = points[pointIndex];
  let previous = points[(pointIndex - 1 + count) % count];
  let next = points[(pointIndex + 1) % count];
  let tangentX = next.x - previous.x;
  let tangentY = next.y - previous.y;
  let tangentLength = max(0.001, sqrt(tangentX * tangentX + tangentY * tangentY));
  let normalX = -tangentY / tangentLength;
  let normalY = tangentX / tangentLength;
  let jelly = scene.session.photoFrame.jelly;
  let loopPhase = (pointIndex / count) * Math.PI * 2;
  let seedPhase = (seed % 97) * 0.137;
  let time = scene.elapsedTime * jelly.speed;
  let broadPhase = loopPhase * 2 + time + seedPhase;
  let detailPhase = loopPhase * 5 - time * 1.35 + seedPhase * 1.7;
  let breathPhase = time * 0.62 + seedPhase * 0.35;
  let jitter =
    (Math.sin(broadPhase) * jelly.broadAmount +
      Math.sin(detailPhase) * jelly.detailAmount +
      Math.sin(breathPhase) * jelly.breathAmount) *
    scene.ui.scale;
  let tangentJitter =
    Math.sin(loopPhase * 3 + time * 0.68 + seedPhase * 0.6) *
    jelly.tangentAmount *
    scene.ui.scale;
  let animated = {
    x: point.x + normalX * jitter + (tangentX / tangentLength) * tangentJitter,
    y: point.y + normalY * jitter + (tangentY / tangentLength) * tangentJitter,
  };
  let card = creationCardBounds();
  return {
    x: constrain(animated.x, card.x, card.x + card.width),
    y: constrain(animated.y, card.y, card.y + card.height),
  };
}

function pixelatedSessionPhotoFramePoints(points, seed = 0) {
  let gridSize = 16 * scene.ui.scale;
  let pixelated = [];
  for (let i = 0; i < points.length; i++) {
    let animated = animatedSessionPhotoFramePoint(points, i, seed);
    let point = {
      x: round(animated.x / gridSize) * gridSize,
      y: round(animated.y / gridSize) * gridSize,
    };
    let previous = pixelated[pixelated.length - 1];
    if (previous == null) {
      pixelated.push(point);
      continue;
    }
    if (point.x == previous.x && point.y == previous.y) continue;

    pixelated.push(point);
  }
  return pixelated;
}

function updateSessionPhotoFrameBuffer() {
  let frame = scene.session.photoFrame;
  let bufferWidth = max(1, round(width));
  let bufferHeight = max(1, round(height));
  if (frame.buffer == null) {
    frame.buffer = createGraphics(bufferWidth, bufferHeight);
    frame.buffer.pixelDensity(1);
    frame.dirty = true;
  } else if (
    frame.buffer.width != bufferWidth ||
    frame.buffer.height != bufferHeight
  ) {
    frame.buffer.resizeCanvas(bufferWidth, bufferHeight);
    frame.dirty = true;
  }

  if (!frame.dirty || !frame.closed || scene.session.photo == null) {
    return frame.buffer;
  }

  let context = frame.buffer.drawingContext;
  context.clearRect(0, 0, bufferWidth, bufferHeight);
  context.save();
  context.beginPath();
  context.moveTo(frame.points[0].x, frame.points[0].y);
  for (let i = 1; i < frame.points.length; i++) {
    context.lineTo(frame.points[i].x, frame.points[i].y);
  }
  context.closePath();
  context.clip();

  let photo = scene.session.photo;
  let placement = sessionPhotoPlacement();
  context.drawImage(
    photo.canvas,
    placement.x,
    placement.y,
    placement.width,
    placement.height,
  );
  context.restore();
  frame.dirty = false;
  return frame.buffer;
}

function drawSessionPhotoFrameOutline(target, alpha = 255, layerZ = 0) {
  let points = scene.session.photoFrame.points;
  if (points.length < 2) return;
  let primaryColor = sessionPhotoFrameStrokeRgb();
  let secondaryColor = sessionPhotoFrameSecondaryStrokeRgb();

  target.push();
  target.translate(
    -width / 2,
    -height / 2,
    scene.layer.content + layerZ + 0.25,
  );
  target.noFill();
  target.stroke(primaryColor[0], primaryColor[1], primaryColor[2], alpha);
  target.strokeWeight(max(2, 4 * scene.ui.scale));
  target.strokeJoin(ROUND);
  target.strokeCap(ROUND);
  target.beginShape();
  for (let i = 0; i < points.length; i++) {
    let point = animatedSessionPhotoFramePoint(points, i, 17);
    target.vertex(point.x, point.y);
  }
  target.endShape();

  target.stroke(
    secondaryColor[0],
    secondaryColor[1],
    secondaryColor[2],
    alpha,
  );
  target.strokeWeight(max(2, 4 * scene.ui.scale));
  target.strokeJoin(ROUND);
  target.strokeCap(ROUND);
  target.beginShape();
  for (let point of pixelatedSessionPhotoFramePoints(points, 83)) {
    target.vertex(point.x, point.y);
  }
  target.endShape();
  target.pop();
}

function sessionPhotoFrameStrokeRgb() {
  return [255, 255, 255];
}

function sessionPhotoFrameSecondaryStrokeRgb() {
  let background = scene.session.backgroundColor;
  let primary = sessionPhotoFrameStrokeRgb().map((channel) => channel / 255);
  let primaryHsv = rgbToHsvValues(primary, background.hue + 0.5);
  let brightness = background.brightness < 0.5 ? 0.95 : 0.32;
  let secondary = hsvToRgbValues({
    hue: primaryHsv.hue + 1 / 3,
    saturation: max(0.72, primaryHsv.saturation),
    brightness,
  });
  return secondary.map((channel) => channel * 255);
}

function drawClippedSessionPhoto(layerZ = 0) {
  let frame = scene.session.photoFrame;
  updateSessionPhotoFrameFaceAdjustment();
  if (!frame.closed || scene.session.photo == null) return;

  let buffer = updateSessionPhotoFrameBuffer();
  scene.workspace.push();
  scene.workspace.translate(0, 0, scene.layer.content + layerZ);
  scene.workspace.imageMode(CENTER);
  scene.workspace.image(buffer, 0, 0, width, height);
  scene.workspace.pop();
  drawSessionPhotoFrameOutline(scene.workspace, 255, layerZ);
}

function drawJumpingPhotoFrameGuide(label, y, textSizeValue) {
  textAlign(LEFT, BOTTOM);
  textSize(textSizeValue);
  let words = label.split(" ");
  let gap = textWidth(" ");
  let widths = words.map((word) => textWidth(word));
  let totalWidth =
    widths.reduce((sum, wordWidth) => sum + wordWidth, 0) +
    gap * max(0, words.length - 1);
  let wordDelay = 0.16;
  let jumpDuration = 0.42;
  let cycleDuration =
    max(1, words.length) * wordDelay + jumpDuration + 0.7;
  let cycleTime = scene.elapsedTime % cycleDuration;
  let jumpHeight = 12 * scene.ui.scale;
  let x = -totalWidth / 2;

  for (let i = 0; i < words.length; i++) {
    let wordTime = cycleTime - i * wordDelay;
    let jump =
      wordTime >= 0 && wordTime <= jumpDuration
        ? sin((wordTime / jumpDuration) * 180) * jumpHeight
        : 0;
    text(words[i], x, y - jump);
    x += widths[i] + gap;
  }
}

function drawSessionPhotoFrameReference() {
  let photo = scene.session.photo;
  let frame = scene.session.photoFrame;
  if (photo == null) return;

  let preview;
  if (frame.closed) {
    preview = updateSessionPhotoFrameBuffer();
  } else {
    let placement = sessionPhotoPlacement();
    if (placement == null) return;
    let bounds = creationCardBounds();
    let bufferWidth = max(1, round(width));
    let bufferHeight = max(1, round(height));
    if (frame.referenceBuffer == null) {
      frame.referenceBuffer = createGraphics(bufferWidth, bufferHeight);
      frame.referenceBuffer.pixelDensity(1);
    } else if (
      frame.referenceBuffer.width != bufferWidth ||
      frame.referenceBuffer.height != bufferHeight
    ) {
      frame.referenceBuffer.resizeCanvas(bufferWidth, bufferHeight);
    }

    preview = frame.referenceBuffer;
    let context = preview.drawingContext;
    context.clearRect(0, 0, bufferWidth, bufferHeight);
    context.save();
    context.beginPath();
    context.roundRect(
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      creationCardCornerRadius(bounds),
    );
    context.clip();
    context.drawImage(
      photo.canvas,
      placement.x,
      placement.y,
      placement.width,
      placement.height,
    );
    context.restore();
  }

  push();
  resetMatrix();
  ortho();
  resetShader();
  imageMode(CENTER);
  if (!frame.closed) tint(255, 100);
  image(preview, 0, 0, width, height);
  noTint();
  pop();
}

function sessionPhotoFrameUiRgb() {
  let rgb = sessionBackgroundRgb();
  let luminance = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  return luminance > 0.58 ? [29, 29, 29] : [255, 255, 255];
}

function drawPhotoFrameCardOverlay(card, alpha = 255) {
  let state = scene.frameOverlay;
  if (state.artwork?.width <= 1 || state.textMask?.width <= 1) return;
  let sourceInset = 2;
  push();
  resetShader();
  imageMode(CENTER);
  noStroke();
  tint(255, alpha);
  image(
    state.artwork,
    card.x + card.width / 2 - width / 2,
    card.y + card.height / 2 - height / 2,
    card.width,
    card.height,
    sourceInset,
    sourceInset,
    state.artwork.width - sourceInset * 2,
    state.artwork.height - sourceInset * 2,
  );
  let foregroundValue = lerp(29, 255, state.foregroundMix);
  tint(foregroundValue, alpha);
  image(
    state.textMask,
    card.x + card.width / 2 - width / 2,
    card.y + card.height / 2 - height / 2,
    card.width,
    card.height,
    sourceInset,
    sourceInset,
    state.textMask.width - sourceInset * 2,
    state.textMask.height - sourceInset * 2,
  );
  noTint();
  pop();
}

function drawPhotoFramePointer(card, transition, uiRgb) {
  let frame = scene.session.photoFrame;
  let cursorState = frame.cursor;
  let cursorAsset = scene.flowUi.slices.drawCursor;
  if (
    cursorAsset?.width <= 1 ||
    frame.closed ||
    scene.session.cameraPrompt.exitConfirming
  ) return;

  if (!Number.isFinite(cursorState.x) || !Number.isFinite(cursorState.y)) {
    cursorState.x = mouseX;
    cursorState.y = mouseY;
    cursorState.lastMovedAt = millis();
  }
  if (dist(cursorState.x, cursorState.y, mouseX, mouseY) > 0.5) {
    cursorState.lastMovedAt = millis();
  }
  cursorState.x = mouseX;
  cursorState.y = mouseY;
  let textVisible =
    !frame.drawing &&
    millis() - cursorState.lastMovedAt >= cursorState.idleDelay;
  cursorState.textMix = animateData(
    cursorState.textMix,
    textVisible ? 1 : 0,
    textVisible ? 0.16 : 0.35,
  );

  let pulse = 1 + sin(scene.elapsedTime * 140) * 0.035;
  let cursorHeight = min(card.height * 0.115, 86 * scene.ui.scale) * pulse;
  let cursorWidth = cursorHeight * cursorAsset.width / cursorAsset.height;
  let ringSize = cursorHeight * 1.55;
  let margin = ringSize * 0.65;
  let guideX = constrain(
    cursorState.x,
    margin,
    width - margin,
  ) - width / 2;
  let guideY = constrain(
    cursorState.y,
    margin,
    height - margin,
  ) - height / 2;

  push();
  resetShader();
  noFill();
  stroke(uiRgb[0], uiRgb[1], uiRgb[2], 105 * transition);
  strokeWeight(max(1, scene.ui.scale));
  circle(guideX, guideY, ringSize);
  circle(guideX, guideY, ringSize * 0.72);
  noStroke();
  tint(255, 255 * transition);
  imageMode(CENTER);
  image(cursorAsset, guideX, guideY, cursorWidth, cursorHeight);
  noTint();
  fill(
    uiRgb[0],
    uiRgb[1],
    uiRgb[2],
    235 * transition * cursorState.textMix,
  );
  textFont(scene.font);
  textAlign(CENTER, TOP);
  textSize(max(11, card.width * 0.038));
  text("Touch and drag\nanywhere", guideX, guideY + ringSize * 0.58);
  pop();
}

function drawPhotoFrameStage() {
  if (scene.session.mode != "frame") return;

  let frame = scene.session.photoFrame;
  frame.transition = animateData(frame.transition, 1, 0.16);
  let transition = frame.transition;
  let scale = scene.ui.scale;
  let titleHeight = scene.ui.button.height * scale;
  let padding = scene.ui.button.padding * scale;
  let controlGap = 12 * scale;
  let card = creationCardBounds();
  let titleY = max(
    card.y - height / 2 - max(titleHeight * 0.75, padding),
    uiSafeTopY(padding + titleHeight / 2),
  );
  let buttonWidth = min(card.width * 0.44, 220 * scale);
  let controlsY = min(
    uiSafeBottomY(padding + titleHeight / 2),
    card.y + card.height - height / 2 + titleHeight,
  );
  let controlsOffset = buttonWidth / 2 + controlGap / 2;
  let backgroundRgb = sessionBackgroundRgb().map((channel) => channel * 255);
  let outerRgb = backgroundRgb.map((channel) => lerp(channel, 255, 0.18));
  let uiRgb = sessionPhotoFrameUiRgb();
  frame.reviewTransition = animateData(
    frame.reviewTransition,
    frame.closed && !frame.faceAdjustment?.active ? 1 : 0,
    0.16,
  );

  push();
  resetMatrix();
  ortho();
  resetShader();
  translate(0, 0, scene.layer.ui + 128);
  rectMode(CENTER);
  noStroke();
  fill(outerRgb[0], outerRgb[1], outerRgb[2], 255 * transition);
  rect(0, 0, width, height);
  fill(backgroundRgb[0], backgroundRgb[1], backgroundRgb[2], 255 * transition);
  rect(
    card.x + card.width / 2 - width / 2,
    card.y + card.height / 2 - height / 2,
    card.width,
    card.height,
    creationCardCornerRadius(card),
  );
  _renderer.GL.clear(_renderer.GL.DEPTH_BUFFER_BIT);

  drawSessionPhotoFrameReference();
  drawPhotoFrameCardOverlay(card, 255 * transition);

  let headerY = uiSafeTopY(padding + titleHeight / 2);
  scene.gui.frameExit.bounds = null;

  let timerAsset = scene.flowUi.slices.timer;
  let timerWidth = min(width * 0.15, 150 * scale);
  let timerHeight = timerWidth * 251 / 469;
  if (timerAsset?.width > 1) {
    imageMode(CENTER);
    image(
      timerAsset,
      width / 2 - scene.ui.safeArea.right - padding - timerWidth / 2,
      headerY,
      timerWidth,
      timerHeight,
    );
    fill(25);
    textFont(scene.text.font);
    textAlign(CENTER, CENTER);
    textSize(timerHeight * 0.48);
    text(
      sessionPhotoFrameTimerLabel(),
      width / 2 - padding - timerWidth / 2,
      headerY - timerHeight * 0.04,
    );
  }

  resetShader();
  fill(uiRgb[0], uiRgb[1], uiRgb[2], 255 * transition);
  textFont(scene.font);
  textAlign(CENTER, CENTER);
  textSize(titleHeight / 1.5);
  text(
    frame.closed ? "Review Your Frame" : "Draw Your Frame",
    0,
    titleY - titleHeight / 10,
  );

  let points = frame.points;
  if (points.length > 0) {
    let start = points[0];
    let primaryColor = sessionPhotoFrameStrokeRgb();
    let secondaryColor = sessionPhotoFrameSecondaryStrokeRgb();
    if (!frame.closed) {
      noFill();
      stroke(uiRgb[0], uiRgb[1], uiRgb[2], 210 * transition);
      strokeWeight(max(1, 2 * scale));
      circle(
        start.x - width / 2,
        start.y - height / 2,
        frame.closeRadius * scale * 2,
      );
      noStroke();
      fill(uiRgb[0], uiRgb[1], uiRgb[2], 230 * transition);
      circle(start.x - width / 2, start.y - height / 2, 10 * scale);
    }

    noFill();
    stroke(primaryColor[0], primaryColor[1], primaryColor[2], 255 * transition);
    strokeWeight(max(2, 4 * scale));
    strokeJoin(ROUND);
    strokeCap(ROUND);
    beginShape();
    for (let i = 0; i < points.length; i++) {
      let point = animatedSessionPhotoFramePoint(points, i, 17);
      vertex(point.x - width / 2, point.y - height / 2);
    }
    endShape();

    stroke(
      secondaryColor[0],
      secondaryColor[1],
      secondaryColor[2],
      255 * transition,
    );
    strokeWeight(max(2, 4 * scale));
    strokeJoin(ROUND);
    strokeCap(ROUND);
    beginShape();
    for (let point of pixelatedSessionPhotoFramePoints(points, 83)) {
      vertex(point.x - width / 2, point.y - height / 2);
    }
    endShape();
  }

  if (frame.closed) {
    resetShader();
    noStroke();
    let controlTransition = frame.reviewTransition;
    let hiddenY = uiHiddenBottomY(titleHeight, padding);
    let animatedControlsY = lerp(hiddenY, controlsY, controlTransition);

    scene.gui.frameNext.armed =
      scene.ui.pointer.pressTarget == "frameNext";
    drawFlowSliceButton(
      scene.gui.frameNext,
      "next",
      controlsOffset,
      animatedControlsY,
      buttonWidth,
      titleHeight * 1.2,
    );

    scene.gui.frameRedraw.armed =
      scene.ui.pointer.pressTarget == "frameRedraw";
    drawFlowSliceButton(
      scene.gui.frameRedraw,
      "redraw",
      -controlsOffset,
      animatedControlsY,
      buttonWidth,
      titleHeight * 1.2,
    );
  } else {
    scene.gui.frameNext.bounds = null;
    scene.gui.frameRedraw.bounds = null;
    noStroke();
    fill(uiRgb[0], uiRgb[1], uiRgb[2], 230 * transition);
    textFont(scene.font);
    let guideTextSize = 48 * scale;
    let instruction =
      points.length == 0
        ? "Draw one with closed loop!"
        : "Continue until you return to the start";
    drawJumpingPhotoFrameGuide(
      instruction,
      uiSafeBottomY(padding),
      guideTextSize,
    );
  }
  drawPhotoFramePointer(card, transition, uiRgb);
  pop();
}
