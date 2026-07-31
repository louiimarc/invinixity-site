var scene = {
    pixScale: 1.0,
    elapsedTime: 0.0,
    fps: { numstep: 0, current: 0, minimum: 12, maximum: 30 },
    maxRayBounces: 3,
    layer: {
      background: 0,
      content: 256,
      ui: 512,
    },
    checkerboard: {
      buffer: null,
      width: 0,
      height: 0,
    },
  },
  inout = {
    audio: { spectrum: {} },
  },
  data = {
    loading: {
      status: true,
      ready: false,
      startedAt: 0,
      minimumDuration: 0.75,
      arrived: false,
      position: {
        x: 0.0,
        y: 0.0,
      },
      progress: 0,
    },
    amount: 3,
    counter: 0,
    animate: 0,
  };

let demo = false;

scene.text = {
  edit: false,
  font: null,
  svg: {
    sources: {},
    glyphs: {},
    buffers: {},
    viewBoxSize: 1024,
    edgeAmount: 10,
    edgeFrequency: 0.055,
    edgeDetailFrequency: 0.14,
    edgeSpeed: 0.75,
    curveStep: 12,
  },
  buffer: "",
  input: null,
  maxCharacters: 24,
  activeWord: -1,
  pathEditArmed: false,
  storageKey: "playspace.text.v1",
  glyphCache: {},
  boil: {
    enabled: true,
    mode: "filled",
    pathAmount: 4,
    pathWaveAmount: 22.5,
    pathWaveFrequency: 0.025,
    glyphAmount: 0,
    glyphAngle: 0,
    glyphScale: 0,
    touchGrowAmount: 0.55,
    touchGrowRadius: 120,
    filledCopies: 1,
    speed: 1.8,
    sampleFactor: 0.18,
    simplifyThreshold: 0,
    lineMaxDistance: 28,
  },
  cursor: {
    pos: 0,
    preferredColumn: 0,
    shape: "_",
  },
  pathGesture: {
    active: false,
    drawing: false,
    pathIndex: -1,
    start: { x: 0, y: 0 },
    threshold: 12,
  },
  paths: Object.create(null),
  colors: Object.create(null),
  sizes: Object.create(null),
  sizeAnimations: Object.create(null),
};

scene.content = {
  text: {
    scaleDefault: 0.5,
    scaleRange: 160,
    scaleSmooth: 0.18,
  },
};

scene.ui = {
  base: {
    width: 1280,
    height: 720,
  },
  scale: 1,
  minimumScale: 0.75,
  maximumScale: 1.35,
  button: {
    width: 136,
    height: 68,
    radius: 34,
    padding: 34,
  },
  controls: {
    position: 0,
  },
  colorPanel: {
    position: 0,
    detent: 1,
    height: 0,
    dragging: false,
    dragStartY: 0,
    dragStartHeight: 0,
    dragMoved: false,
    bounds: null,
    pickerScale: {
      hue: 1,
      saturationBrightness: 1,
    },
    displayColor: null,
    wheelTexture: null,
    wheelTextureResolution: 0,
    wheelTextureHue: null,
  },
  sizePanel: {
    position: 0,
  },
  textField: {
    gap: 20,
    position: 0,
    label: "Edit",
    opacity: null,
    scales: null,
    rotations: null,
    offsets: null,
    display: null,
    cursorDrag: {
      active: false,
      startX: 0,
      startPos: 0,
      step: 24,
    },
  },
  slider: {
    active: null,
  },
  pointer: {
    target: { x: 0, y: 0 },
    smooth: { x: 0, y: 0 },
    targetActive: 1,
    active: 1,
    activeInSmooth: 0.8,
    activeOutSmooth: 0.2,
    pressTarget: null,
    pressStartedOnButton: false,
  },
};

function updateUiScale() {
  let fitScale = min(
    width / scene.ui.base.width,
    height / scene.ui.base.height,
  );
  scene.ui.scale = constrain(
    fitScale,
    scene.ui.minimumScale,
    scene.ui.maximumScale,
  );
}

function setUiPointer(x = mouseX, y = mouseY) {
  scene.ui.pointer.target.x = x;
  scene.ui.pointer.target.y = y;
}

function setUiPointerActive(value = 1) {
  scene.ui.pointer.targetActive = value;
}

function updateUiPointer() {
  scene.ui.pointer.smooth.x = animateData(
    scene.ui.pointer.smooth.x,
    scene.ui.pointer.target.x,
    0.35,
  );
  scene.ui.pointer.smooth.y = animateData(
    scene.ui.pointer.smooth.y,
    scene.ui.pointer.target.y,
    0.35,
  );
  let activeSmooth =
    scene.ui.pointer.targetActive > scene.ui.pointer.active
      ? scene.ui.pointer.activeInSmooth
      : scene.ui.pointer.activeOutSmooth;

  scene.ui.pointer.active = animateData(
    scene.ui.pointer.active,
    scene.ui.pointer.targetActive,
    activeSmooth,
  );
}

function uiPointer() {
  return [scene.ui.pointer.smooth.x, scene.ui.pointer.smooth.y];
}

function uiPointerActive() {
  return scene.ui.pointer.active;
}

function uiButtonBounds(side = "left") {
  let scale = scene.ui.scale;
  let w = scene.ui.button.width * scale;
  let h = scene.ui.button.height * scale;
  let r = scene.ui.button.radius * scale;
  let padding = scene.ui.button.padding * scale;
  let x =
    side == "right"
      ? width / 2 - padding - w / 2
      : -width / 2 + padding + w / 2;
  let y = -height / 2 + padding + h / 2;

  return { x, y, w, h, r };
}

function uiVerticalSliderBounds(side = "right") {
  let scale = scene.ui.scale;
  let w = scene.ui.button.height * scale;
  let h = scene.ui.button.height * 6 * scale;
  let r = scene.ui.button.radius * scale;
  let padding = scene.ui.button.padding * scale;
  let x =
    side == "right"
      ? width / 2 - padding - w / 2
      : -width / 2 + padding + w / 2;
  let y = 0;

  return { x, y, w, h, r };
}

function sliderValueFromPointer(bounds, pointerY = mouseY) {
  let y = pointerY - height / 2;
  return constrain(1 - (y - (bounds.y - bounds.h / 2)) / bounds.h, 0, 1);
}

function horizontalSliderValueFromPointer(bounds, pointerX = mouseX) {
  let x = pointerX - width / 2;
  return constrain((x - (bounds.x - bounds.w / 2)) / bounds.w, 0, 1);
}

function setTextScaleValue(value) {
  let entry = textWordEntries()[scene.text.activeWord];
  if (entry == null) return;
  scene.text.sizes[entry.key] = constrain(value, 0, 1);
  saveTextMemory();
}

function setTextColorValue(channel, value) {
  let entry = textWordEntries()[scene.text.activeWord];
  if (entry == null) return;
  let color = textColorForWordIndex(scene.text.activeWord);
  if (!(channel in color)) return;
  scene.text.colors[entry.key] = {
    ...color,
    [channel]: constrain(value, 0, 1),
  };
  saveTextMemory();
}

function pointerInsideBounds(bounds) {
  let pointer = {
    x: mouseX - width / 2,
    y: mouseY - height / 2,
  };

  return (
    pointer.x >= bounds.x - bounds.w / 2 &&
    pointer.x <= bounds.x + bounds.w / 2 &&
    pointer.y >= bounds.y - bounds.h / 2 &&
    pointer.y <= bounds.y + bounds.h / 2
  );
}

function currentColumn() {
  let before = scene.text.buffer.substring(0, scene.text.cursor.pos);
  let lines = before.split("\n");
  return lines[lines.length - 1].length;
}

function cleanTextInput(value) {
  let cleaned = "";
  let characterCount = 0;

  for (let character of value) {
    if (/\s/u.test(character)) {
      if (cleaned != "" && !cleaned.endsWith(" ")) cleaned += " ";
      continue;
    }

    if (characterCount >= scene.text.maxCharacters) continue;
    cleaned += character;
    characterCount++;
  }

  return cleaned;
}

function setupTextInput() {
  scene.text.input = document.getElementById("text-input");
  if (scene.text.input == null) return;

  scene.text.input.value = scene.text.buffer;
  scene.text.input.addEventListener("keydown", blockTextInputReturn);
  scene.text.input.addEventListener("input", syncTextFromInput);
  scene.text.input.addEventListener("compositionend", syncTextFromInput);
  scene.text.input.addEventListener("select", syncTextCursorFromInput);
  scene.text.input.addEventListener("keyup", syncTextCursorFromInput);
  scene.text.input.addEventListener("click", syncTextCursorFromInput);
}

function blockTextInputReturn(event) {
  if (event.key == "Enter") {
    event.preventDefault();
    setTextEdit(false);
  }
}

function syncTextFromInput(event) {
  if (scene.text.input == null) return;
  if (event?.isComposing) return;

  let original = scene.text.input.value;
  let selectionStart = scene.text.input.selectionStart || 0;
  let selectionEnd = scene.text.input.selectionEnd || selectionStart;
  let selectionDirection = scene.text.input.selectionDirection || "forward";
  let cleaned = cleanTextInput(original);
  if (cleaned != original) {
    let cleanedStart = cleanTextInput(original.substring(0, selectionStart)).length;
    let cleanedEnd = cleanTextInput(original.substring(0, selectionEnd)).length;
    scene.text.input.value = cleaned;
    scene.text.input.setSelectionRange(
      constrain(cleanedStart, 0, cleaned.length),
      constrain(cleanedEnd, 0, cleaned.length),
      selectionDirection,
    );
  }

  scene.text.buffer = cleaned;
  syncTextPathAssignments();
  syncTextCursorFromInput();
  saveTextMemory();
}

function syncTextCursorFromInput(event) {
  if (scene.text.input == null) return;
  scene.text.cursor.pos =
    scene.text.input.selectionDirection == "backward"
      ? scene.text.input.selectionStart || 0
      : scene.text.input.selectionEnd || 0;
  scene.text.cursor.preferredColumn = currentColumn();
  updateActiveWordFromCaret(scene.text.cursor.pos);
  if (event != null && scene.text.edit) {
    inout.audio.ui?.textSelection(
      scene.text.input.selectionStart || 0,
      scene.text.input.selectionEnd || 0,
      scene.text.buffer.length,
    );
  }
}

function syncInputFromText() {
  if (scene.text.input == null) return;
  scene.text.buffer = cleanTextInput(scene.text.buffer);
  if (scene.text.input.value != scene.text.buffer) {
    scene.text.input.value = scene.text.buffer;
  }
  scene.text.input.setSelectionRange(scene.text.cursor.pos, scene.text.cursor.pos);
}

function focusTextInput() {
  if (scene.text.input == null) return;
  syncInputFromText();
  scene.text.input.focus({ preventScroll: true });
}

function setTextCursor(pos) {
  setTextSelection(pos, pos);
}

function setTextSelection(anchor, focus) {
  anchor = constrain(anchor, 0, scene.text.buffer.length);
  focus = constrain(focus, 0, scene.text.buffer.length);
  let start = min(anchor, focus);
  let end = max(anchor, focus);
  let direction = focus < anchor ? "backward" : "forward";

  scene.text.cursor.pos = focus;
  scene.text.cursor.preferredColumn = currentColumn();
  updateActiveWordFromCaret(focus);

  if (scene.text.input != null) {
    scene.text.input.setSelectionRange(start, end, direction);
  }

  if (scene.text.edit) {
    inout.audio.ui?.textSelection(start, end, scene.text.buffer.length);
  }

  saveTextMemory();
}

function textFieldCursorFromPointer(pointerX = mouseX) {
  let display = scene.ui.textField.display;
  let bounds = scene.gui.edit?.bounds;
  if (display == null || bounds == null) return scene.text.cursor.pos;

  push();
  textFont(scene.font);
  textSize(bounds.h / 1.25);

  let labelWidth = Array.from(display.label).reduce(
    (sum, character) => sum + textWidth(character),
    0,
  );
  let labelLeft = width / 2 + bounds.x - labelWidth / 2;
  let cursorX =
    labelLeft + (display.leftEllipsis ? textWidth(".") * 3 : 0);
  let visibleText = scene.text.buffer.substring(display.start, display.end);

  for (let i = 0; i < visibleText.length; i++) {
    let characterWidth = textWidth(visibleText[i]);
    if (pointerX < cursorX + characterWidth / 2) {
      pop();
      return display.start + i;
    }
    cursorX += characterWidth;
  }

  pop();
  return display.end;
}

function setTextEdit(value) {
  if (!value) {
    let leadingSpaceCount = scene.text.buffer.length - scene.text.buffer.trimStart().length;
    scene.text.buffer = cleanTextInput(scene.text.buffer).trim();
    scene.text.cursor.pos = constrain(
      scene.text.cursor.pos - leadingSpaceCount,
      0,
      scene.text.buffer.length,
    );
  }

  scene.text.edit = value;
  syncInputFromText();

  if (scene.text.input == null) return;

  if (scene.text.edit) {
    focusTextInput();
    syncTextCursorFromInput();
  } else {
    scene.text.input.blur();
    saveTextMemory();
  }
}

function saveTextMemory() {
  try {
    let paths = Object.create(null);
    for (let [wordKey, path] of Object.entries(scene.text.paths)) {
      if (path == null) continue;
      paths[wordKey] = path.map((point) => ({ x: point.x, y: point.y }));
    }

    let memory = {
      buffer: scene.text.buffer,
      cursorPos: scene.text.cursor.pos,
      colors: { ...scene.text.colors },
      sizes: { ...scene.text.sizes },
      paths,
    };
    localStorage.setItem(scene.text.storageKey, JSON.stringify(memory));
  } catch (error) {
    console.warn("Unable to save text memory", error);
  }
}

function loadTextMemory() {
  try {
    let raw = localStorage.getItem(scene.text.storageKey);
    if (raw == null) {
      return;
    }

    let memory = JSON.parse(raw);
    scene.text.buffer = typeof memory.buffer == "string" ? memory.buffer : "";
    scene.text.cursor.pos = constrain(
      memory.cursorPos || scene.text.buffer.length,
      0,
      scene.text.buffer.length,
    );
    scene.text.cursor.preferredColumn = currentColumn();
    scene.text.colors = Object.create(null);
    if (memory.colors != null && typeof memory.colors == "object") {
      for (let [wordKey, color] of Object.entries(memory.colors)) {
        scene.text.colors[wordKey] = cleanStoredTextColor(color);
      }
    } else if (memory.color != null && typeof memory.color == "object") {
      let color = cleanStoredTextColor(memory.color);
      for (let entry of textWordEntries()) {
        scene.text.colors[entry.key] = { ...color };
      }
    }
    scene.text.sizes = Object.create(null);
    if (
      memory.sizes != null &&
      typeof memory.sizes == "object" &&
      !Array.isArray(memory.sizes)
    ) {
      for (let [wordKey, value] of Object.entries(memory.sizes)) {
        if (Number.isFinite(value)) {
          scene.text.sizes[wordKey] = constrain(value, 0, 1);
        }
      }
    }
    scene.text.sizeAnimations = Object.create(null);
    scene.text.paths = Object.create(null);
    if (
      memory.paths != null &&
      typeof memory.paths == "object" &&
      !Array.isArray(memory.paths)
    ) {
      for (let [wordKey, storedPath] of Object.entries(memory.paths)) {
        let path = loadStoredTextPath(storedPath);
        if (path != null) {
          scene.text.paths[wordKey] = path;
          continue;
        }

        // Migrate the briefly used word -> occurrence array format.
        if (!Array.isArray(storedPath)) continue;
        for (let i = 0; i < storedPath.length; i++) {
          path = loadStoredTextPath(storedPath[i]);
          if (path != null) scene.text.paths[`${wordKey}_${i + 1}`] = path;
        }
      }
    } else {
      let storedPaths = Array.isArray(memory.paths)
        ? memory.paths
        : Array.isArray(memory.path)
          ? [memory.path]
          : [];
      for (let i = 0; i < storedPaths.length; i++) {
        let path = loadStoredTextPath(storedPaths[i]);
        if (path != null) setTextPathForWordIndex(i, path);
      }
    }
    syncTextPathAssignments();
    scene.text.activeWord = firstWordWithoutPath();
    scene.text.pathEditArmed = scene.text.activeWord >= 0;

    syncInputFromText();
  } catch (error) {
    console.warn("Unable to load text memory", error);
  }
}

function clearTextMemory() {
  scene.text.buffer = "";
  scene.text.cursor.pos = 0;
  scene.text.cursor.preferredColumn = 0;
  scene.text.paths = Object.create(null);
  scene.text.colors = Object.create(null);
  scene.text.sizes = Object.create(null);
  scene.text.sizeAnimations = Object.create(null);
  scene.text.activeWord = -1;
  scene.text.pathEditArmed = false;
  syncInputFromText();

  try {
    localStorage.removeItem(scene.text.storageKey);
  } catch (error) {
    console.warn("Unable to clear text memory", error);
  }
}

function textWords() {
  return scene.text.buffer.match(/\S+/g) || [];
}

function textWordEntries() {
  let entries = [];
  let occurrences = Object.create(null);
  let expression = /\S+/g;
  let match;

  while ((match = expression.exec(scene.text.buffer)) != null) {
    let word = match[0];
    let occurrence = occurrences[word] || 0;
    occurrence++;
    entries.push({
      word,
      occurrence,
      key: `${word}_${occurrence}`,
      start: match.index,
      end: match.index + word.length,
    });
    occurrences[word] = occurrence;
  }

  return entries;
}

function textWordRanges() {
  return textWordEntries().map(({ start, end }) => ({ start, end }));
}

function defaultTextColor() {
  return { hue: 0, saturation: 0, brightness: 1 };
}

function cleanStoredTextColor(color) {
  let cleaned = defaultTextColor();
  if (color == null || typeof color != "object") return cleaned;
  for (let channel of ["hue", "saturation", "brightness"]) {
    if (Number.isFinite(color[channel])) {
      cleaned[channel] = constrain(color[channel], 0, 1);
    }
  }
  return cleaned;
}

function textColorForWordIndex(wordIndex) {
  let entry = textWordEntries()[wordIndex];
  if (entry == null) return defaultTextColor();
  return scene.text.colors[entry.key] || defaultTextColor();
}

function textScaleValueForWordIndex(wordIndex) {
  let entry = textWordEntries()[wordIndex];
  if (entry == null) return scene.content.text.scaleDefault;
  let value = scene.text.sizes[entry.key];
  return Number.isFinite(value)
    ? constrain(value, 0, 1)
    : scene.content.text.scaleDefault;
}

function textSizeForWordIndex(wordIndex, baseSize) {
  let entry = textWordEntries()[wordIndex];
  let value = textScaleValueForWordIndex(wordIndex);
  let target = map(
    value,
    0,
    1,
    -scene.content.text.scaleRange,
    scene.content.text.scaleRange,
  );
  if (entry == null) return baseSize + target;

  let current = scene.text.sizeAnimations[entry.key];
  if (!Number.isFinite(current)) current = target;
  current = animateData(current, target, scene.content.text.scaleSmooth);
  scene.text.sizeAnimations[entry.key] = current;
  return baseSize + current;
}

function loadStoredTextPath(path) {
  if (!Array.isArray(path)) return null;
  let points = path
    .filter(
      (point) =>
        point != null &&
        Number.isFinite(point.x) &&
        Number.isFinite(point.y),
    )
    .map((point) => createVector(point.x, point.y));
  return points.length > 0 ? points : null;
}

function textPathForWordIndex(wordIndex) {
  let entry = textWordEntries()[wordIndex];
  if (entry == null) return null;
  return scene.text.paths[entry.key] || null;
}

function setTextPathForWordIndex(wordIndex, path) {
  let entry = textWordEntries()[wordIndex];
  if (entry == null) return false;
  scene.text.paths[entry.key] = path;
  return true;
}

function textWordIndexAtPosition(position) {
  let ranges = textWordRanges();
  for (let i = 0; i < ranges.length; i++) {
    if (position >= ranges[i].start && position <= ranges[i].end) return i;
  }
  return -1;
}

function updateActiveWordFromCaret(position) {
  scene.text.activeWord = textWordIndexAtPosition(position);
  scene.text.pathEditArmed = scene.text.activeWord >= 0;
}

function firstWordWithoutPath(start = 0) {
  let wordCount = textWords().length;
  for (let i = start; i < wordCount; i++) {
    if (textPathForWordIndex(i) == null) return i;
  }
  for (let i = 0; i < start; i++) {
    if (textPathForWordIndex(i) == null) return i;
  }
  return -1;
}

function syncTextPathAssignments() {
  let wordCount = textWords().length;
  if (scene.text.activeWord < 0 || scene.text.activeWord >= wordCount) {
    updateActiveWordFromCaret(scene.text.cursor.pos);
  }
}

function textFieldCharacterOpacity(start, end, leftEllipsis, rightEllipsis) {
  let opacity = leftEllipsis ? [255, 255, 255] : [];
  let wordIndex = -1;
  let insideWord = false;

  for (let i = 0; i < scene.text.buffer.length; i++) {
    let character = scene.text.buffer[i];
    if (/\s/.test(character)) {
      insideWord = false;
      if (i >= start && i < end) opacity.push(255);
      continue;
    }

    if (!insideWord) {
      insideWord = true;
      wordIndex++;
    }

    if (i >= start && i < end) {
      opacity.push(textPathForWordIndex(wordIndex) != null ? 255 : 153);
    }
  }

  if (rightEllipsis) opacity.push(255, 255, 255);
  return opacity;
}

function textFieldCharacterScales(start, end, leftEllipsis, rightEllipsis) {
  let scales = leftEllipsis ? [1, 1, 1] : [];
  let wordIndex = -1;
  let wordCharacterIndex = 0;
  let insideWord = false;

  for (let i = 0; i < scene.text.buffer.length; i++) {
    let character = scene.text.buffer[i];
    if (/\s/.test(character)) {
      insideWord = false;
      wordCharacterIndex = 0;
      if (i >= start && i < end) scales.push(1);
      continue;
    }

    if (!insideWord) {
      insideWord = true;
      wordIndex++;
      wordCharacterIndex = 0;
    }

    if (i >= start && i < end) {
      let active =
        wordIndex == scene.text.activeWord &&
        (textPathForWordIndex(wordIndex) == null || scene.text.pathEditArmed);
      scales.push(active ? 1.08 : 1);
    }
    wordCharacterIndex++;
  }

  if (rightEllipsis) scales.push(1, 1, 1);
  return scales;
}

function textFieldCharacterRotations(start, end, leftEllipsis, rightEllipsis) {
  let rotations = leftEllipsis ? [0, 0, 0] : [];
  let wordIndex = -1;
  let wordCharacterIndex = 0;
  let insideWord = false;

  for (let i = 0; i < scene.text.buffer.length; i++) {
    let character = scene.text.buffer[i];
    if (/\s/.test(character)) {
      insideWord = false;
      wordCharacterIndex = 0;
      if (i >= start && i < end) rotations.push(0);
      continue;
    }

    if (!insideWord) {
      insideWord = true;
      wordIndex++;
      wordCharacterIndex = 0;
    }

    if (i >= start && i < end) {
      let active =
        wordIndex == scene.text.activeWord &&
        (textPathForWordIndex(wordIndex) == null || scene.text.pathEditArmed);
      let phase = scene.elapsedTime * 8 + wordCharacterIndex * 1.7;
      let shake = Math.sin(phase) + Math.sin(phase * 1.73 + 0.8) * 0.35;
      rotations.push(active ? shake * 0.035 : 0);
    }
    wordCharacterIndex++;
  }

  if (rightEllipsis) rotations.push(0, 0, 0);
  return rotations;
}

function textFieldCharacterOffsets(start, end, leftEllipsis, rightEllipsis) {
  let offsets = leftEllipsis
    ? [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }]
    : [];
  let wordIndex = -1;
  let wordCharacterIndex = 0;
  let insideWord = false;

  for (let i = 0; i < scene.text.buffer.length; i++) {
    let character = scene.text.buffer[i];
    if (/\s/.test(character)) {
      insideWord = false;
      wordCharacterIndex = 0;
      if (i >= start && i < end) offsets.push({ x: 0, y: 0 });
      continue;
    }

    if (!insideWord) {
      insideWord = true;
      wordIndex++;
      wordCharacterIndex = 0;
    }

    if (i >= start && i < end) {
      let active =
        wordIndex == scene.text.activeWord &&
        (textPathForWordIndex(wordIndex) == null || scene.text.pathEditArmed);
      let phase = scene.elapsedTime * 9.5 + wordCharacterIndex * 1.45;
      offsets.push(
        active
          ? {
              x:
                Math.sin(phase * 1.31 + wordCharacterIndex * 0.7) * 0.035 +
                Math.sin(phase * 0.67 + 1.4) * 0.012,
              y:
                Math.sin(phase * 1.73 + 2.2) * 0.045 +
                Math.sin(phase * 0.91 + wordCharacterIndex * 0.4) * 0.015,
            }
          : { x: 0, y: 0 },
      );
    }
    wordCharacterIndex++;
  }

  if (rightEllipsis) {
    offsets.push({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 });
  }
  return offsets;
}

function textFieldSelectionColor(wordIndex) {
  let entry = textWordEntries()[wordIndex];
  let color = entry == null ? null : scene.text.colors[entry.key];
  return color == null
    ? { hue: 0, saturation: 0, brightness: 0.8, opacity: 0.5 }
    : { ...color, opacity: 0.8 };
}

function textFieldSelectionStops(start, end) {
  let span = max(1, end - start);
  let stops = [];
  let entries = textWordEntries();

  for (let i = 0; i < entries.length; i++) {
    let entry = entries[i];
    let overlapStart = max(start, entry.start);
    let overlapEnd = min(end, entry.end);
    if (overlapStart >= overlapEnd) continue;
    let overlapLength = overlapEnd - overlapStart;
    let bleed = min(0.75, overlapLength * 0.25);
    let color = textFieldSelectionColor(i);

    stops.push({
      offset: (overlapStart + bleed - start) / span,
      color,
    });
    stops.push({
      offset: (overlapEnd - bleed - start) / span,
      color,
    });
  }

  if (stops.length == 0) {
    stops.push({ offset: 0.5, color: textFieldSelectionColor(-1) });
  }
  return stops;
}

function textFieldDisplayLabel(maxWidth = Infinity, textSizeValue = 16) {
  scene.ui.textField.selection = null;
  scene.ui.textField.opacity = null;
  scene.ui.textField.scales = null;
  scene.ui.textField.rotations = null;
  scene.ui.textField.offsets = null;
  scene.ui.textField.display = null;
  if (!scene.text.edit) {
    return "Edit";
  }

  let selectionStart = scene.text.input?.selectionStart ?? scene.text.cursor.pos;
  let selectionEnd = scene.text.input?.selectionEnd ?? selectionStart;
  let selectionDirection = scene.text.input?.selectionDirection || "forward";
  let selectionFrom = min(selectionStart, selectionEnd);
  let selectionTo = max(selectionStart, selectionEnd);
  let selectionActive = selectionFrom != selectionTo;
  let focus = selectionDirection == "backward" ? selectionFrom : selectionTo;
  let displayStart = 0;
  let displayEnd = scene.text.buffer.length;

  push();
  textFont(scene.font);
  textSize(textSizeValue);

  function displayLabel() {
    let leftEllipsis = displayStart > 0 ? "..." : "";
    let rightEllipsis = displayEnd < scene.text.buffer.length ? "..." : "";
    let visible = scene.text.buffer.substring(displayStart, displayEnd);

    return leftEllipsis + visible + rightEllipsis;
  }

  let label = displayLabel();
  while (textWidth(label) > maxWidth && displayStart < displayEnd) {
    let leftDistance = max(0, focus - displayStart);
    let rightDistance = max(0, displayEnd - focus);

    if (leftDistance > rightDistance && displayStart < focus) {
      displayStart++;
    } else if (displayEnd > focus) {
      displayEnd--;
    } else if (displayStart < displayEnd) {
      displayStart++;
    } else {
      break;
    }

    label = displayLabel();
  }

  scene.ui.textField.display = {
    start: displayStart,
    end: displayEnd,
    label,
    leftEllipsis: displayStart > 0,
    rightEllipsis: displayEnd < scene.text.buffer.length,
  };
  scene.ui.textField.opacity = textFieldCharacterOpacity(
    displayStart,
    displayEnd,
    displayStart > 0,
    displayEnd < scene.text.buffer.length,
  );
  scene.ui.textField.scales = textFieldCharacterScales(
    displayStart,
    displayEnd,
    displayStart > 0,
    displayEnd < scene.text.buffer.length,
  );
  scene.ui.textField.rotations = textFieldCharacterRotations(
    displayStart,
    displayEnd,
    displayStart > 0,
    displayEnd < scene.text.buffer.length,
  );
  scene.ui.textField.offsets = textFieldCharacterOffsets(
    displayStart,
    displayEnd,
    displayStart > 0,
    displayEnd < scene.text.buffer.length,
  );

  if (selectionActive) {
    let visibleSelectionStart = max(selectionFrom, displayStart);
    let visibleSelectionEnd = min(selectionTo, displayEnd);
    if (visibleSelectionStart < visibleSelectionEnd) {
      let ellipsisOffset = displayStart > 0 ? 3 : 0;
      scene.ui.textField.selection = {
        start: ellipsisOffset + visibleSelectionStart - displayStart,
        end: ellipsisOffset + visibleSelectionEnd - displayStart,
        gradientStart: ellipsisOffset,
        gradientEnd: ellipsisOffset + displayEnd - displayStart,
        colorStops: textFieldSelectionStops(displayStart, displayEnd),
      };
    }
  } else if (selectionStart >= displayStart && selectionStart <= displayEnd) {
    let ellipsisOffset = displayStart > 0 ? 3 : 0;
    let cursorIndex = ellipsisOffset + selectionStart - displayStart;
    scene.ui.textField.selection = {
      start: cursorIndex,
      end: cursorIndex,
      caret: true,
      gradientStart: ellipsisOffset,
      gradientEnd: ellipsisOffset + displayEnd - displayStart,
      colorStops: textFieldSelectionStops(displayStart, displayEnd),
    };
  }

  pop();
  return label;
}

function smoothPath(points) {
  let result = [];

  for (let i = 1; i < points.length - 1; i++) {
    let x = (points[i - 1].x + points[i].x + points[i + 1].x) / 3;
    let y = (points[i - 1].y + points[i].y + points[i + 1].y) / 3;
    result.push(createVector(x, y));
  }

  return result;
}

function boilingPath(points) {
  if (!scene.text.boil.enabled) {
    return points;
  }

  let amount = scene.text.boil.pathAmount;
  let waveAmount = scene.text.boil.pathWaveAmount;
  let waveFrequency = scene.text.boil.pathWaveFrequency;
  let time = scene.elapsedTime * scene.text.boil.speed;
  let result = [];

  for (let i = 0; i < points.length; i++) {
    let p = points[i];
    let previous = points[max(0, i - 1)];
    let next = points[min(points.length - 1, i + 1)];
    let tangent = createVector(next.x - previous.x, next.y - previous.y);
    if (tangent.mag() < 0.001) {
      tangent = createVector(1, 0);
    }

    tangent.normalize();
    let normal = createVector(-tangent.y, tangent.x);
    let phaseNoise = noise(i * 0.09, time * 0.35) * 180;
    let wave =
      sin(i * waveFrequency * 360 + time * 120 + phaseNoise) *
      waveAmount *
      (0.45 + noise(i * 0.13 + 18, time * 0.45) * 0.55);
    let jitterX = (noise(i * 0.17, time) - 0.5) * amount;
    let jitterY = (noise(i * 0.17 + 99, time) - 0.5) * amount;

    result.push(
      createVector(p.x + normal.x * wave + jitterX, p.y + normal.y * wave + jitterY),
    );
  }

  return result;
}

function svgGlyphCharacters() {
  return [
    ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    ..."abcdefghijklmnopqrstuvwxyz",
    ..."0123456789",
  ];
}

function svgGlyphFilename(char) {
  if (/[A-Z]/.test(char)) return `uppercase-${char}.svg`;
  if (/[a-z]/.test(char)) return `lowercase-${char}.svg`;
  return `number-${char}.svg`;
}

function prepareSvgGlyphs() {
  for (let char of svgGlyphCharacters()) {
    prepareSvgGlyph(char);
  }
}

function prepareSvgGlyph(char) {
  let source = scene.text.svg.sources[char];
  if (!source) return;

  let svg = Array.isArray(source) ? source.join("\n") : source;
  let pathMatch = svg.match(/<path\b[^>]*\bd="([^"]+)"/i);
  if (!pathMatch) return;

  let contours = flattenSvgPath(pathMatch[1]);
  if (contours.length == 0) return;

  let bounds = contourBounds(contours);
  scene.text.svg.glyphs[char] = {
    contours,
    center: {
      x: (bounds.x1 + bounds.x2) / 2,
      y: (bounds.y1 + bounds.y2) / 2,
    },
    hierarchy: contourHierarchy(contours),
  };
}

function flattenSvgPath(pathData) {
  let tokens = pathData.match(/[A-Za-z]|[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi) || [];
  let contours = [];
  let contour = [];
  let command = "";
  let cursor = { x: 0, y: 0 };
  let start = { x: 0, y: 0 };
  let index = 0;

  function readPoint() {
    return { x: Number(tokens[index++]), y: Number(tokens[index++]) };
  }

  function finishContour() {
    if (contour.length > 2) {
      let first = contour[0];
      let last = contour[contour.length - 1];
      if (dist(first.x, first.y, last.x, last.y) < 0.001) contour.pop();
      contours.push(contour);
    }
    contour = [];
  }

  while (index < tokens.length) {
    if (/[A-Za-z]/.test(tokens[index])) command = tokens[index++];

    if (command == "M") {
      finishContour();
      cursor = readPoint();
      start = { ...cursor };
      contour.push({ ...cursor });
      command = "L";
    } else if (command == "L") {
      cursor = readPoint();
      contour.push({ ...cursor });
    } else if (command == "Q") {
      let control = readPoint();
      let end = readPoint();
      let length =
        dist(cursor.x, cursor.y, control.x, control.y) +
        dist(control.x, control.y, end.x, end.y);
      let steps = constrain(ceil(length / scene.text.svg.curveStep), 3, 24);
      for (let step = 1; step <= steps; step++) {
        let t = step / steps;
        let inverse = 1 - t;
        contour.push({
          x: inverse * inverse * cursor.x + 2 * inverse * t * control.x + t * t * end.x,
          y: inverse * inverse * cursor.y + 2 * inverse * t * control.y + t * t * end.y,
        });
      }
      cursor = end;
    } else if (command == "C") {
      let control1 = readPoint();
      let control2 = readPoint();
      let end = readPoint();
      let length =
        dist(cursor.x, cursor.y, control1.x, control1.y) +
        dist(control1.x, control1.y, control2.x, control2.y) +
        dist(control2.x, control2.y, end.x, end.y);
      let steps = constrain(ceil(length / scene.text.svg.curveStep), 4, 32);
      for (let step = 1; step <= steps; step++) {
        let t = step / steps;
        let inverse = 1 - t;
        contour.push({
          x:
            inverse * inverse * inverse * cursor.x +
            3 * inverse * inverse * t * control1.x +
            3 * inverse * t * t * control2.x +
            t * t * t * end.x,
          y:
            inverse * inverse * inverse * cursor.y +
            3 * inverse * inverse * t * control1.y +
            3 * inverse * t * t * control2.y +
            t * t * t * end.y,
        });
      }
      cursor = end;
    } else if (command == "Z" || command == "z") {
      cursor = { ...start };
      finishContour();
      command = "";
    } else {
      throw new Error(`Unsupported SVG path command: ${command}`);
    }
  }

  finishContour();
  return contours;
}

function contourBounds(contours) {
  let points = contours.flat();
  return {
    x1: min(...points.map((point) => point.x)),
    y1: min(...points.map((point) => point.y)),
    x2: max(...points.map((point) => point.x)),
    y2: max(...points.map((point) => point.y)),
  };
}

function contourArea(contour) {
  let area = 0;
  for (let i = 0; i < contour.length; i++) {
    let point = contour[i];
    let next = contour[(i + 1) % contour.length];
    area += point.x * next.y - next.x * point.y;
  }
  return area / 2;
}

function pointInsideContour(point, contour) {
  let inside = false;
  for (let i = 0, j = contour.length - 1; i < contour.length; j = i++) {
    let a = contour[i];
    let b = contour[j];
    let intersects =
      a.y > point.y != b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function contourHierarchy(contours) {
  let areas = contours.map((contour) => abs(contourArea(contour)));
  let parents = contours.map(() => -1);

  for (let i = 0; i < contours.length; i++) {
    let parentArea = Infinity;
    for (let j = 0; j < contours.length; j++) {
      if (i == j || areas[j] <= areas[i]) continue;
      if (pointInsideContour(contours[i][0], contours[j]) && areas[j] < parentArea) {
        parents[i] = j;
        parentArea = areas[j];
      }
    }
  }

  let depths = parents.map((_, index) => {
    let depth = 0;
    let parent = parents[index];
    while (parent >= 0) {
      depth++;
      parent = parents[parent];
    }
    return depth;
  });

  return { parents, depths };
}

function wiggledSvgContour(contour, seed, contourIndex, amount) {
  let time =
    scene.elapsedTime * scene.text.boil.speed * scene.text.svg.edgeSpeed;
  let frequency = scene.text.svg.edgeFrequency;
  let detailFrequency = scene.text.svg.edgeDetailFrequency;

  return contour.map((point, index) => {
    let previous = contour[(index - 1 + contour.length) % contour.length];
    let next = contour[(index + 1) % contour.length];
    let tangentX = next.x - previous.x;
    let tangentY = next.y - previous.y;
    let magnitude = max(0.001, sqrt(tangentX * tangentX + tangentY * tangentY));
    let noiseSeed = seed * 0.17 + contourIndex * 3.1;
    let broadNoise = noise(noiseSeed, index * frequency, time * 0.55) - 0.5;
    let detailNoise =
      noise(noiseSeed + 41.7, index * detailFrequency, time) - 0.5;
    let offset = (broadNoise * 1.6 + detailNoise * 0.4) * amount;

    return {
      x: point.x + (-tangentY / magnitude) * offset,
      y: point.y + (tangentX / magnitude) * offset,
    };
  });
}

function fillWorkspaceText(gfx, color = defaultTextColor()) {
  gfx.colorMode(HSB, 360, 100, 100, 255);
  gfx.fill(
    color.hue * 360,
    color.saturation * 100,
    color.brightness * 100,
  );
  gfx.colorMode(RGB, 255);
}

function drawSvgGlyph(
  gfx,
  glyph,
  size,
  seed,
  wiggle = true,
  color = defaultTextColor(),
) {
  let scaleValue = size / scene.text.svg.viewBoxSize;
  let amount = wiggle ? scene.text.svg.edgeAmount / scaleValue : 0;
  let contours = glyph.contours.map((contour, index) =>
    wiggledSvgContour(contour, seed, index, amount),
  );
  let bufferSize = max(1, ceil(size * 1.25));
  let buffer = scene.text.svg.buffers[seed];

  if (buffer == null) {
    buffer = createGraphics(bufferSize, bufferSize);
    buffer.pixelDensity(1);
    scene.text.svg.buffers[seed] = buffer;
  } else if (buffer.width != bufferSize || buffer.height != bufferSize) {
    buffer.resizeCanvas(bufferSize, bufferSize);
  }

  buffer.clear();
  buffer.push();
  buffer.translate(bufferSize / 2, bufferSize / 2);
  buffer.scale(scaleValue);
  buffer.translate(-glyph.center.x, -glyph.center.y);
  buffer.noStroke();
  fillWorkspaceText(buffer, color);

  for (let i = 0; i < contours.length; i++) {
    if (glyph.hierarchy.depths[i] % 2 != 0) continue;

    buffer.beginShape();
    for (let point of contours[i]) buffer.vertex(point.x, point.y);

    for (let hole = 0; hole < contours.length; hole++) {
      if (
        glyph.hierarchy.parents[hole] != i ||
        glyph.hierarchy.depths[hole] % 2 == 0
      ) {
        continue;
      }
      buffer.beginContour();
      for (let point of contours[hole]) buffer.vertex(point.x, point.y);
      buffer.endContour();
    }

    buffer.endShape(CLOSE);
  }

  buffer.pop();

  gfx.imageMode(CENTER);
  gfx.image(buffer, 0, 0, bufferSize, bufferSize);
}

function glyphPointsFor(char, size) {
  if (char.trim() == "") {
    return [];
  }

  let roundedSize = round(size);
  let key = char + ":" + roundedSize;

  if (scene.text.glyphCache[key] == null) {
    scene.text.glyphCache[key] = scene.text.font.textToPoints(
      char,
      0,
      0,
      roundedSize,
      {
        sampleFactor: scene.text.boil.sampleFactor,
        simplifyThreshold: scene.text.boil.simplifyThreshold,
      },
    );
  }

  return scene.text.glyphCache[key];
}

function drawBoilingGlyph(
  gfx,
  char,
  size,
  seed = 0,
  color = defaultTextColor(),
) {
  fillWorkspaceText(gfx, color);
  let svgGlyph = scene.text.svg.glyphs[char];
  if (svgGlyph) {
    drawSvgGlyph(
      gfx,
      svgGlyph,
      size,
      seed,
      scene.text.boil.enabled,
      color,
    );
    return;
  }

  if (/[A-Za-z0-9]/.test(char)) {
    return;
  }

  if (!scene.text.boil.enabled) {
    gfx.text(char, 0, 0);
    return;
  }

  if (scene.text.boil.mode == "filled") {
    if (char.trim() == "") {
      return;
    }

    let time = scene.elapsedTime * scene.text.boil.speed;
    let copies = scene.text.boil.filledCopies;

    gfx.noStroke();
    gfx.textSize(size);

    for (let i = 0; i < copies; i++) {
      let copySeed = seed + i * 17;
      let amount = scene.text.boil.glyphAmount * (i == 0 ? 0.35 : 1);
      let x = (noise(copySeed, time) - 0.5) * amount;
      let y = (noise(copySeed + 31, time) - 0.5) * amount;
      let angle =
        (noise(copySeed + 63, time) - 0.5) * scene.text.boil.glyphAngle;
      let scale =
        1 + (noise(copySeed + 95, time) - 0.5) * scene.text.boil.glyphScale;

      gfx.push();
      gfx.translate(x, y);
      gfx.rotate(angle);
      gfx.scale(scale);
      gfx.text(char, 0, 0);
      gfx.pop();
    }

    return;
  }

  let points = glyphPointsFor(char, size);
  if (points.length == 0) {
    return;
  }

  let amount = scene.text.boil.glyphAmount;
  let time = scene.elapsedTime * scene.text.boil.speed;
  let maxDistance = scene.text.boil.lineMaxDistance * (size / 128);

  gfx.noFill();
  gfx.stroke(255);
  gfx.strokeWeight(max(1.5, size * 0.035));

  for (let i = 1; i < points.length; i++) {
    let a = points[i - 1];
    let b = points[i];
    let distance = dist(a.x, a.y, b.x, b.y);

    if (distance > maxDistance) {
      continue;
    }

    let ax = a.x + (noise(seed, i * 0.07, time) - 0.5) * amount;
    let ay = a.y + (noise(seed + 31, i * 0.07, time) - 0.5) * amount;
    let bx = b.x + (noise(seed, (i + 1) * 0.07, time) - 0.5) * amount;
    let by = b.y + (noise(seed + 31, (i + 1) * 0.07, time) - 0.5) * amount;

    gfx.line(ax, ay, bx, by);
  }
}

function buildLengths(points) {
  let lengths = [0];

  for (let i = 1; i < points.length; i++) {
    let d = p5.Vector.dist(points[i - 1], points[i]);
    lengths.push(lengths[i - 1] + d);
  }

  return lengths;
}

function pointOnPath(points, lengths, target) {
  for (let i = 1; i < lengths.length; i++) {
    if (target <= lengths[i]) {
      let t = (target - lengths[i - 1]) / (lengths[i] - lengths[i - 1]);

      return p5.Vector.lerp(
        points[i - 1],

        points[i],

        t,
      );
    }
  }

  return points[points.length - 1];
}

function dynamicScaling(minFPS = 12, maxFPS = 30) {
  scene.fps.current = animateData(scene.fps.current, frameRate(), 0.25);

  if (scene.fps.current < minFPS && scene.pixScale > 0.04398046511104) {
    scene.pixScale = max(scene.pixScale / 1.25, 0.04398046511104);
    scene.workspace.resizeCanvas(
      windowWidth * scene.pixScale,
      windowHeight * scene.pixScale,
    );
    //        console.log('down', scene.fps.numstep);
  } else if (
    scene.fps.current > maxFPS &&
    scene.pixScale < 1 &&
    frameCount % 8 == 0
  ) {
    scene.pixScale = min(scene.pixScale / 0.8, 1);
    scene.workspace.resizeCanvas(
      windowWidth * scene.pixScale,
      windowHeight * scene.pixScale,
    );
    //        console.log('up', scene.fps.numstep);
  } else {
    //        console.log('idle');
  }
}

function animateData(activeValues, targetValues, smoothFactor = 0.25) {
  return activeValues * (1 - smoothFactor) + targetValues * smoothFactor;
}

let pentatonicScale = [220, 247.5, 275, 330, 366.67],
  majorScale = [220, 247.5, 275, 293.33, 330, 366.67, 412.5],
  minorScale = [220, 247.5, 264, 293.33, 330, 352, 396],
  harmonicMinorScale = [220, 247.5, 264, 293.33, 330, 352, 412.5],
  japaneseInsenScale = [220, 264, 293.33, 330, 396],
  bluesScale = [220, 264, 293.33, 309.38, 330, 396],
  wholeToneScale = [220, 247.5, 275, 302.5, 330, 357.5],
  diminishedScale = [220, 234.67, 247.5, 264, 293.33, 330, 352, 412.5],
  slendroScale = [220, 247, 277, 330, 370],
  pelogScale = [220, 235, 270, 290, 330, 350, 390];
