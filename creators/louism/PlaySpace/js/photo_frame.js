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
  frame.drawing = false;
  frame.closed = false;
  frame.dirty = true;
  frame.transition = 0;
  frame.reviewTransition = 0;
  frame.faceAdjustment = null;
  frame.faceRequestId = -1;
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
  let point = constrainPointToComposition(x, y);
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
    scene.session.photoFrame.closed
  ) {
    return false;
  }
  if (!pointInsideComposition(mouseX, mouseY)) return true;

  let frame = scene.session.photoFrame;
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
      createVector(
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
    let protectedPoints = protectSessionPhotoFrameFromFaces(drawnPoints);
    if (scene.session.faceDetection.status == "ready") {
      frame.faceRequestId = scene.session.faceDetection.requestId;
    }
    frame.points = drawnPoints;
    frame.faceAdjustment = {
      active: sessionPhotoFramePathsDiffer(drawnPoints, protectedPoints),
      startedAt: millis(),
      duration: 0.45,
      source: drawnPoints,
      target: protectedPoints,
    };
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
  resetSessionPhotoFrame();
  scheduleSessionCacheSave();
}

function acceptSessionPhotoFrame() {
  let frame = scene.session.photoFrame;
  if (scene.session.mode != "frame" || !frame.closed) return;
  scene.session.mode = "active";
  scene.ui.pointer.pressTarget = null;
  scene.ui.pointer.pressStartedOnButton = false;
  setTextEdit(true);
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

  let size = max(1, right - left, bottom - top);
  return {
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
    size,
  };
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

  let fit = max(bounds.size / photo.width, bounds.size / photo.height);
  let photoWidth = photo.width * fit;
  let photoHeight = photo.height * fit;
  let photoLeft = bounds.centerX - photoWidth / 2;
  let photoTop = bounds.centerY - photoHeight / 2;
  let protectedFaceRatio = 0.75;
  return detection.boxes.map((box) => {
    let faceWidth = box.width * photoWidth;
    let faceHeight = box.height * photoHeight;
    return {
      centerX: photoLeft + (box.x + box.width / 2) * photoWidth,
      centerY: photoTop + (box.y + box.height / 2) * photoHeight,
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

  let source = frame.points.map((point) => point.copy());
  let base = frame.faceAdjustment?.active
    ? frame.faceAdjustment.target
    : source;
  let protectedPoints = protectSessionPhotoFrameFromFaces(base);
  frame.faceRequestId = detection.requestId;
  if (!sessionPhotoFramePathsDiffer(base, protectedPoints)) return;

  frame.faceAdjustment = {
    active: true,
    startedAt: millis(),
    duration: 0.45,
    source,
    target: protectedPoints,
  };
  frame.dirty = true;
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
  return {
    x: point.x + normalX * jitter + (tangentX / tangentLength) * tangentJitter,
    y: point.y + normalY * jitter + (tangentY / tangentLength) * tangentJitter,
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
  let bounds = sessionPhotoFrameBounds();
  let fit = max(bounds.size / photo.width, bounds.size / photo.height);
  let photoWidth = photo.width * fit;
  let photoHeight = photo.height * fit;
  context.drawImage(
    photo.canvas,
    bounds.centerX - photoWidth / 2,
    bounds.centerY - photoHeight / 2,
    photoWidth,
    photoHeight,
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

function drawPhotoFrameStage() {
  if (scene.session.mode != "frame") return;

  let frame = scene.session.photoFrame;
  frame.transition = animateData(frame.transition, 1, 0.16);
  let transition = frame.transition;
  let scale = scene.ui.scale;
  let titleHeight = scene.ui.button.height * scale;
  let padding = scene.ui.button.padding * scale;
  let titleWidth = min(width - padding * 2, 420 * scale);
  let titleY = -height / 2 + padding + titleHeight / 2;
  let titleRadius = scene.ui.button.radius * scale;
  let controlGap = 12 * scale;
  let buttonWidth = min(width - padding * 2, 260 * scale);
  let redrawY = height / 2 - padding - titleHeight / 2;
  let nextY = redrawY - titleHeight - controlGap;
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
  fill(0, 95 * transition);
  rect(0, 0, width, height);
  _renderer.GL.clear(_renderer.GL.DEPTH_BUFFER_BIT);

  scene.gui.frameTitle.update(
    scene.elapsedTime,
    uiPointer(),
    uiPointerActive(),
  );
  scene.gui.frameTitle.surface(
    0,
    titleY,
    titleWidth,
    titleHeight,
    titleRadius,
  );
  resetShader();
  fill(255, 255 * transition);
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
      stroke(255, 210 * transition);
      strokeWeight(max(1, 2 * scale));
      circle(
        start.x - width / 2,
        start.y - height / 2,
        frame.closeRadius * scale * 2,
      );
      noStroke();
      fill(255, 230 * transition);
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
    fill(255);
    let controlTransition = frame.reviewTransition;
    let hiddenY = height / 2 + titleHeight;
    let animatedNextY = lerp(hiddenY, nextY, controlTransition);
    let animatedRedrawY = lerp(hiddenY, redrawY, controlTransition);

    scene.gui.frameNext.armed =
      scene.ui.pointer.pressTarget == "frameNext";
    scene.gui.frameNext.update(
      scene.elapsedTime,
      uiPointer(),
      uiPointerActive(),
    );
    scene.gui.frameNext.button(
      0,
      animatedNextY,
      buttonWidth,
      titleHeight,
      titleRadius,
      1,
      ...scene.ui.actionColors.green,
    );

    scene.gui.frameRedraw.armed =
      scene.ui.pointer.pressTarget == "frameRedraw";
    scene.gui.frameRedraw.update(
      scene.elapsedTime,
      uiPointer(),
      uiPointerActive(),
    );
    scene.gui.frameRedraw.button(
      0,
      animatedRedrawY,
      buttonWidth,
      titleHeight,
      titleRadius,
      1,
      ...scene.ui.actionColors.red,
    );
  } else {
    scene.gui.frameNext.bounds = null;
    scene.gui.frameRedraw.bounds = null;
    noStroke();
    fill(255, 230 * transition);
    textFont(scene.font);
    let guideTextSize = 48 * scale;
    let instruction =
      points.length == 0
        ? "Draw one closed loop"
        : "Continue until you return to the start";
    drawJumpingPhotoFrameGuide(
      instruction,
      height / 2 - padding,
      guideTextSize,
    );
  }
  pop();
}
