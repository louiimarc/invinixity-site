var PLAYSPACE_REMOTE_API_ORIGIN =
  "https://playspace-poster-api.louis-marcellino.workers.dev";

function playSpaceApiOrigin() {
  if (typeof window.PLAYSPACE_API_ORIGIN == "string") {
    return window.PLAYSPACE_API_ORIGIN.replace(/\/$/, "");
  }
  return PLAYSPACE_REMOTE_API_ORIGIN;
}

function playSpaceApiUrl(path) {
  let normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${playSpaceApiOrigin()}${normalizedPath}`;
}

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
    composition: {
      width: 1080,
      height: 1920,
      exportWidth: 1440,
      exportHeight: 2560,
      fitScale: 0.8,
      safeInset: 0.08,
      cornerRadius: 0.05,
      tintBuffer: null,
      tintKey: "",
      controlPanelWidth: null,
    },
    creationCard: {
      width: 1080,
      height: 1350,
      widthRatio: 0.7734375,
      safeInset: 0.08,
      cornerRadius: 0.05,
    },
    frameOverlay: {
      paletteHexes: [
        "F79D1F",
        "CDDD46",
        "DBDCDA",
        "7BCBBB",
        "C1BEDF",
        "4D1430",
      ],
      darkForegroundBackgrounds: ["DBDCDA", "7BCBBB", "CDDD46"],
      sourcePath: "assets/poster/overlay/foreground.svg?v=20260831-new-overlay",
      artwork: null,
      textMask: null,
      foregroundMix: 0,
    },
    debug: {
      guides: false,
    },
    session: {
      generation: 0,
      mode: "loading",
      restoreMode: null,
      photo: null,
      faceDetection: {
        status: "idle",
        boxes: [],
        requestId: 0,
        error: "",
      },
      backgroundColor: {
        hue: 0,
        saturation: 0,
        brightness: 0.5,
      },
      backgroundFrameIndex: null,
      cameraPrompt: {
        open: false,
        closing: false,
        confirming: false,
        exitConfirming: false,
        exitTransition: 0,
        transition: 0,
        transitionTarget: 0,
        nextMode: "idle",
      },
      camera: {
        video: null,
        stream: null,
        buffer: null,
        captureBuffer: null,
        faceGuideDarkElement: null,
        faceGuideDarkPath: "assets/ui/camera/face_marking.svg",
        faceGuideLightElement: null,
        faceGuideLightPath: "assets/ui/camera/face_marking_light.svg",
        faceGuideOverlay: null,
        faceGuideAnalysisBuffer: null,
        faceGuideLuminance: 0,
        faceGuideLuminanceUpdatedAt: 0,
        faceGuideDarkTarget: 0,
        faceGuideDarkMix: 0,
        captureLabelPath: "assets/data/camera_capture_labels.txt",
        captureLabels: ["Make Your Cover Shot!"],
        captureLabel: "Make Your Cover Shot!",
        previousCaptureLabel: null,
        status: "idle",
        error: "",
        requestId: 0,
        flash: 0,
        nextTransition: 0,
        confirmTransition: 0,
        countdown: {
          active: false,
          value: 3,
          startedAt: 0,
          lastStep: -1,
          patternBaseAngle: -45,
          patternAngle: -45,
          patternPhaseX: 0,
          patternPhaseY: 0,
          scale: "harmonic", // "major", "harmonic", or "harmonicMinor"
        },
      },
      photoFrame: {
        points: [],
        photoPlacement: null,
        layoutNormalized: false,
        drawing: false,
        closed: false,
        dirty: true,
        buffer: null,
        referenceBuffer: null,
        transition: 0,
        reviewTransition: 0,
        startedAt: null,
        deadlineAt: null,
        durationSeconds: 120,
        timeoutHandled: false,
        cursor: {
          x: null,
          y: null,
          lastMovedAt: 0,
          idleDelay: 450,
          textMix: 0,
        },
        faceAdjustment: null,
        faceRequestId: -1,
        closeRadius: 64,
        sampleDistance: 4,
        minimumPoints: 8,
        minimumLength: 128,
        jelly: {
          speed: 1.1,
          broadAmount: 8,
          detailAmount: 2.4,
          breathAmount: 1.4,
          tangentAmount: 1.15,
        },
      },
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
      completedAt: null,
      retireDelay: 3,
      retired: false,
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

function compositionBounds(
  viewWidth = width,
  viewHeight = height,
  controlSide = scene.ui?.controlSide ?? "right",
  alignToControls =
    scene.session?.mode == "active" && scene.text?.edit == true,
  controlMix = scene.ui?.controlSideMix ??
    (controlSide == "left" ? 0 : 1),
  controlPanelWidth = null,
) {
  let scale = min(
    viewWidth / scene.composition.width,
    viewHeight / scene.composition.height,
  ) * scene.composition.fitScale;
  let boundsWidth = scene.composition.width * scale;
  let boundsHeight = scene.composition.height * scale;
  let gutterWidth = max(0, viewWidth - boundsWidth);
  let referenceScale = constrain(
    min(viewWidth / 1280, viewHeight / 720),
    0.75,
    1.35,
  );
  let sidePadding = min(gutterWidth / 2, 34 * referenceScale);
  let centeredX = (viewWidth - boundsWidth) / 2;
  let fallbackControlPanelWidth = min(
    viewWidth * 0.42,
    386 * referenceScale,
  );
  if (controlPanelWidth == null) {
    let usesCurrentViewport = viewWidth == width && viewHeight == height;
    controlPanelWidth = usesCurrentViewport &&
      Number.isFinite(scene.composition.controlPanelWidth)
      ? scene.composition.controlPanelWidth
      : fallbackControlPanelWidth;
  }
  let controlInnerEdge =
    viewWidth - sidePadding - controlPanelWidth;
  let leftAlignedX = max(
    sidePadding,
    (controlInnerEdge - boundsWidth) / 2,
  );
  let rightAlignedX = viewWidth - boundsWidth - leftAlignedX;
  return {
    x: alignToControls
      ? lerp(rightAlignedX, leftAlignedX, controlMix)
      : centeredX,
    y: (viewHeight - boundsHeight) / 2,
    width: boundsWidth,
    height: boundsHeight,
    scale,
  };
}

function controlsOnRight() {
  return scene.ui.controlSide != "left";
}

function controlSideMix() {
  return constrain(scene.ui.controlSideMix, 0, 1);
}

function remapTextPathsBetweenBounds(from, to) {
  for (let path of Object.values(scene.text.paths)) {
    if (!Array.isArray(path)) continue;
    for (let point of path) {
      let mapped = remapPointBetweenBounds(point, from, to);
      point.x = mapped.x;
      point.y = mapped.y;
    }
  }
  scene.text.renderPathCache = new WeakMap();
}

function remapArtworkBetweenBounds(from, to) {
  let frame = scene.session.photoFrame;
  let framePaths = [
    frame.points,
    frame.faceAdjustment?.source,
    frame.faceAdjustment?.target,
  ];
  let remappedFramePaths = new Set();
  for (let path of framePaths) {
    if (!Array.isArray(path) || remappedFramePaths.has(path)) continue;
    remappedFramePaths.add(path);
    for (let point of path) {
      let mapped = remapPointBetweenBounds(point, from, to);
      point.x = mapped.x;
      point.y = mapped.y;
    }
  }
  if (frame.points.length > 0) {
    frame.dirty = true;
  }
  if (frame.photoPlacement != null) {
    let topLeft = remapPointBetweenBounds(
      { x: frame.photoPlacement.x, y: frame.photoPlacement.y },
      from,
      to,
    );
    frame.photoPlacement.x = topLeft.x;
    frame.photoPlacement.y = topLeft.y;
    frame.photoPlacement.width *= to.width / max(1, from.width);
    frame.photoPlacement.height *= to.height / max(1, from.height);
    frame.dirty = true;
  }
  remapTextPathsBetweenBounds(from, to);
  let textScaleRatio = min(
    to.width / max(1, from.width),
    to.height / max(1, from.height),
  );
  for (let [key, value] of Object.entries(scene.text.sizeAnimations)) {
    if (Number.isFinite(value)) {
      scene.text.sizeAnimations[key] = value * textScaleRatio;
    }
  }
}

function compositionSafeBounds(insetRatio = scene.composition.safeInset) {
  let bounds = compositionBounds();
  let inset = min(bounds.width, bounds.height) * insetRatio;
  return {
    x: bounds.x + inset,
    y: bounds.y + inset,
    width: max(1, bounds.width - inset * 2),
    height: max(1, bounds.height - inset * 2),
  };
}

function creationCardBounds(
  viewWidth = width,
  viewHeight = height,
  controlSide = scene.ui?.controlSide ?? "right",
  alignToControls =
    scene.session?.mode == "active" && scene.text?.edit == true,
  controlMix = scene.ui?.controlSideMix ??
    (controlSide == "left" ? 0 : 1),
  controlPanelWidth = null,
) {
  if (scene.session?.mode == "frame" && !alignToControls) {
    let referenceScale = constrain(
      min(viewWidth / 1280, viewHeight / 720),
      0.75,
      1.35,
    );
    let workspaceTop = 152 * referenceScale;
    let workspaceBottom = viewHeight - 92 * referenceScale;
    let workspaceHeight = max(1, workspaceBottom - workspaceTop);
    let maximumWidth = viewWidth * 0.42;
    let scale = min(
      maximumWidth / scene.creationCard.width,
      workspaceHeight / scene.creationCard.height,
    ) * 0.96;
    let cardWidth = scene.creationCard.width * scale;
    let cardHeight = scene.creationCard.height * scale;
    return {
      x: (viewWidth - cardWidth) / 2,
      y: workspaceTop + (workspaceHeight - cardHeight) / 2,
      width: cardWidth,
      height: cardHeight,
      scale,
    };
  }

  if (alignToControls) {
    let referenceScale = constrain(
      min(viewWidth / 1280, viewHeight / 720),
      0.75,
      1.35,
    );
    let padding = 34 * referenceScale;
    let panelGap = 28 * referenceScale;
    let fallbackControlPanelWidth = min(
      viewWidth * 0.42,
      386 * referenceScale,
    );
    if (controlPanelWidth == null) {
      let usesCurrentViewport = viewWidth == width && viewHeight == height;
      controlPanelWidth = usesCurrentViewport &&
        Number.isFinite(scene.composition.controlPanelWidth)
        ? scene.composition.controlPanelWidth
        : fallbackControlPanelWidth;
    }
    let workspaceWidth = max(
      scene.creationCard.width * 0.15,
      viewWidth - padding * 2 - controlPanelWidth - panelGap,
    );
    let leftCenterX = padding + workspaceWidth / 2;
    let rightCenterX = viewWidth - padding - workspaceWidth / 2;
    let workspaceCenterX = lerp(rightCenterX, leftCenterX, controlMix);
    let workspaceTop = 126 * referenceScale;
    let workspaceBottom = viewHeight - 82 * referenceScale;
    let workspaceHeight = max(1, workspaceBottom - workspaceTop);
    let scale = min(
      workspaceWidth / scene.creationCard.width,
      workspaceHeight / scene.creationCard.height,
    ) * 0.96;
    let cardWidth = scene.creationCard.width * scale;
    let cardHeight = scene.creationCard.height * scale;
    return {
      x: workspaceCenterX - cardWidth / 2,
      y: workspaceTop + (workspaceHeight - cardHeight) / 2,
      width: cardWidth,
      height: cardHeight,
      scale,
    };
  }

  let poster = compositionBounds(
    viewWidth,
    viewHeight,
    controlSide,
    alignToControls,
    controlMix,
    controlPanelWidth,
  );
  let cardWidth = poster.width * scene.creationCard.widthRatio;
  let cardHeight =
    cardWidth * scene.creationCard.height / scene.creationCard.width;
  if (cardHeight > poster.height) {
    cardHeight = poster.height;
    cardWidth =
      cardHeight * scene.creationCard.width / scene.creationCard.height;
  }
  return {
    x: poster.x + (poster.width - cardWidth) / 2,
    y: poster.y + (poster.height - cardHeight) / 2,
    width: cardWidth,
    height: cardHeight,
    scale: cardWidth / scene.creationCard.width,
  };
}

function creationCardSafeBounds(insetRatio = scene.creationCard.safeInset) {
  let bounds = creationCardBounds();
  let inset = min(bounds.width, bounds.height) * insetRatio;
  return {
    x: bounds.x + inset,
    y: bounds.y + inset,
    width: max(1, bounds.width - inset * 2),
    height: max(1, bounds.height - inset * 2),
  };
}

function creationCardCornerRadius(bounds = creationCardBounds()) {
  return min(bounds.width, bounds.height) * scene.creationCard.cornerRadius;
}

function pointInsideCreationCard(x, y, safe = false) {
  let bounds = safe ? creationCardSafeBounds() : creationCardBounds();
  return (
    x >= bounds.x &&
    x <= bounds.x + bounds.width &&
    y >= bounds.y &&
    y <= bounds.y + bounds.height
  );
}

function constrainPointToCreationCard(x, y, safe = false) {
  let bounds = safe ? creationCardSafeBounds() : creationCardBounds();
  return createVector(
    constrain(x, bounds.x, bounds.x + bounds.width),
    constrain(y, bounds.y, bounds.y + bounds.height),
  );
}

function compositionCornerRadius(bounds = compositionBounds()) {
  return min(bounds.width, bounds.height) * scene.composition.cornerRadius;
}

function pointInsideComposition(x, y, safe = false) {
  let bounds = safe ? compositionSafeBounds() : compositionBounds();
  return (
    x >= bounds.x &&
    x <= bounds.x + bounds.width &&
    y >= bounds.y &&
    y <= bounds.y + bounds.height
  );
}

function constrainPointToComposition(x, y, safe = false) {
  let bounds = safe ? compositionSafeBounds() : compositionBounds();
  return createVector(
    constrain(x, bounds.x, bounds.x + bounds.width),
    constrain(y, bounds.y, bounds.y + bounds.height),
  );
}

function remapPointBetweenBounds(point, from, to) {
  return createVector(
    to.x + ((point.x - from.x) / max(1, from.width)) * to.width,
    to.y + ((point.y - from.y) / max(1, from.height)) * to.height,
  );
}

function remapArtworkToComposition(
  fromWidth,
  fromHeight,
  fromComposition = true,
) {
  if (!(fromWidth > 0 && fromHeight > 0)) return;
  let from = fromComposition
    ? creationCardBounds(
      fromWidth,
      fromHeight,
      scene.ui.controlSide,
      scene.text.edit,
    )
    : { x: 0, y: 0, width: fromWidth, height: fromHeight };
  let to = creationCardBounds();

  remapArtworkBetweenBounds(from, to);
}

function loadControlSidePreference() {
  try {
    let saved = localStorage.getItem("playspace.control-side.v1");
    if (["left", "right"].includes(saved)) scene.ui.controlSide = saved;
    scene.ui.controlSideMix = controlsOnRight() ? 1 : 0;
  } catch (error) {
    console.warn("Unable to load control-side preference", error);
  }
}

function toggleControlSide() {
  scene.ui.controlSide = controlsOnRight() ? "left" : "right";
  scene.ui.controlSideSavePending = true;
}

function updateControlSideTransition() {
  let target = controlsOnRight() ? 1 : 0;
  let current = controlSideMix();
  if (abs(current - target) < 0.0005) {
    if (current != target) {
      let from = creationCardBounds(
        width,
        height,
        scene.ui.controlSide,
        scene.text.edit,
        current,
      );
      let to = creationCardBounds(
        width,
        height,
        scene.ui.controlSide,
        scene.text.edit,
        target,
      );
      if (scene.text.edit) remapArtworkBetweenBounds(from, to);
      scene.ui.controlSideMix = target;
    }
    if (scene.ui.controlSideSavePending) {
      scene.ui.controlSideSavePending = false;
      try {
        localStorage.setItem(
          "playspace.control-side.v1",
          scene.ui.controlSide,
        );
      } catch (error) {
        console.warn("Unable to save control-side preference", error);
      }
      saveTextMemory();
      scheduleSessionCacheSave();
    }
    return;
  }

  let next = animateData(current, target, 0.18);
  let from = creationCardBounds(
    width,
    height,
    scene.ui.controlSide,
    scene.text.edit,
    current,
  );
  let to = creationCardBounds(
    width,
    height,
    scene.ui.controlSide,
    scene.text.edit,
    next,
  );
  if (scene.text.edit) remapArtworkBetweenBounds(from, to);
  scene.ui.controlSideMix = next;
}

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

scene.text = {
  edit: false,
  font: null,
  buffer: "",
  input: null,
  maxCharacters: 24,
  maxWords: 6,
  activeWord: -1,
  pathEditArmed: false,
  selectionOverride: null,
  storageKey: "playspace.text.v1",
  hasSavedSession: false,
  textureMixes: Object.create(null),
  textureShuffleSeed: 1,
  glyphAssets: {
    entries: [],
    byGroup: Object.create(null),
    byCharacter: Object.create(null),
    assignmentCache: Object.create(null),
    renderHeight: 512,
  },
  renderPathCache: new WeakMap(),
  layerOrder: ["photo"],
  boil: {
    enabled: true,
    pathAmount: 4,
    pathWaveAmount: 22.5,
    pathWaveFrequency: 0.025,
    touchGrowAmount: 0.55,
    touchGrowRadius: 120,
    speed: 1.8,
  },
  cursor: {
    pos: 0,
    preferredColumn: 0,
    shape: "_",
  },
  pathGesture: {
    active: false,
    drawing: false,
    drawable: false,
    moved: false,
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
    glyphScale: 0.9,
  },
};

scene.ui = {
  controlSide: "right",
  controlSideMix: 1,
  controlSideSavePending: false,
  base: {
    width: 1280,
    height: 720,
  },
  scale: 1,
  minimumScale: 0.75,
  maximumScale: 1.35,
  safeArea: {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    viewportKey: "",
  },
  button: {
    width: 136,
    height: 68,
    radius: 34,
    padding: 34,
  },
  actionColors: {
    green: [90, 33.333333, 58.823529],
    red: [350.322581, 60.784314, 100],
  },
  controls: {
    position: 0,
  },
  sideSwitch: {
    position: 0,
  },
  colorPanel: {
    position: 0,
    bounds: null,
    color: {
      hue: 0,
      saturation: 0,
      brightness: 0.5,
    },
    wheelTexture: null,
    wheelTextureResolution: 0,
    wheelTextureRotation: null,
    wheelTextureHue: null,
    wheelTextureDiskMorph: null,
    wheelRotation: 0.25,
    wheelVelocity: 0,
    wheelDragging: false,
    wheelLastTurn: 0,
    wheelLastTime: 0,
    wheelUpdateTime: 0,
    wheelSnapActive: false,
    wheelSnapTarget: 0,
    wheelSnapIndex: 0,
    wheelSettled: true,
    wheelDiskMorph: 1,
    wheelDiskMorphIndex: 0,
    wheelShadowAngle: Math.PI / 2,
    selectedPaletteIndex: null,
    previousSessionPaletteIndex: null,
  },
  texturePad: {
    position: 0,
    bounds: null,
    titleWidth: 0,
    titleWidthScale: 0,
  },
  layerBar: {
    position: 0,
    selectedKey: null,
    dragging: false,
    dragOffsetY: 0,
    dragY: 0,
    bounds: null,
    panelBounds: null,
    panelWidth: 0,
    panelHeight: 0,
    widths: Object.create(null),
    positions: Object.create(null),
  },
  editorHistory: {
    past: [],
    future: [],
    limit: 40,
    restoring: false,
    lastKey: "",
  },
  printPreview: {
    open: false,
    pending: false,
    autoDownload: false,
    sessionGeneration: null,
    snapshot: null,
    posterSnapshot: null,
    layers: [],
    depthTotal: 2.4,
    transition: 0,
    transitionTarget: 0,
    closing: false,
    completeSession: false,
    saveAsExample: false,
    introSpin: {
      active: false,
      startedAt: 0,
      duration: 2.4,
    },
    rotation: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    snap: {
      active: false,
      targetX: 0,
      targetY: 0,
      velocityThreshold: 28,
      smooth: 0.12,
    },
    drag: {
      active: false,
      moved: false,
      lastX: 0,
      lastY: 0,
      lastTime: 0,
    },
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
  updateUiSafeArea();
}

function updateUiSafeArea() {
  let safe = scene.ui.safeArea;
  let viewportKey = `${window.innerWidth}x${window.innerHeight}`;
  if (safe.viewportKey == viewportKey) return;
  let styles = getComputedStyle(document.documentElement);
  let value = (name) => max(
    0,
    Number.parseFloat(styles.getPropertyValue(name)) || 0,
  );
  safe.top = value("--playspace-safe-top");
  safe.right = value("--playspace-safe-right");
  safe.bottom = value("--playspace-safe-bottom");
  safe.left = value("--playspace-safe-left");
  safe.viewportKey = viewportKey;
}

function uiSafeTopY(padding = 0) {
  return -height / 2 + scene.ui.safeArea.top + padding;
}

function uiSafeBottomY(padding = 0) {
  return height / 2 - scene.ui.safeArea.bottom - padding;
}

function uiHiddenTopY(halfExtent = 0, padding = 0) {
  return -height / 2 - scene.ui.safeArea.top - halfExtent - padding;
}

function uiHiddenBottomY(halfExtent = 0, padding = 0) {
  return height / 2 + scene.ui.safeArea.bottom + halfExtent + padding;
}

function uiHiddenLeftX(halfExtent = 0, padding = 0) {
  return -width / 2 - scene.ui.safeArea.left - halfExtent - padding;
}

function uiHiddenRightX(halfExtent = 0, padding = 0) {
  return width / 2 + scene.ui.safeArea.right + halfExtent + padding;
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
      ? width / 2 - scene.ui.safeArea.right - padding - w / 2
      : -width / 2 + scene.ui.safeArea.left + padding + w / 2;
  let y = uiSafeTopY(padding + h / 2);

  return { x, y, w, h, r };
}

function setTextScaleValue(value) {
  let entry = textWordEntries()[scene.text.activeWord];
  if (entry == null) return;
  scene.text.sizes[entry.key] = constrain(value, 0, 1);
  saveTextMemory();
  recordEditorHistory();
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
  let wordCount = 0;
  let insideWord = false;

  for (let character of value) {
    if (/\s/u.test(character)) {
      if (
        cleaned != "" &&
        !cleaned.endsWith(" ") &&
        wordCount < scene.text.maxWords
      ) {
        cleaned += " ";
      }
      insideWord = false;
      continue;
    }

    if (!insideWord) {
      if (wordCount >= scene.text.maxWords) continue;
      wordCount++;
      insideWord = true;
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
  scene.text.input.addEventListener(
    "beforeinput",
    (event) => {
      if (typeof event.data != "string") return;
      let symbol = ["π", "ø"].find((value) => event.data.includes(value));
      if (symbol == null) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (symbol == "π" && typeof toggleSecretSessionMode == "function") {
        toggleSecretSessionMode();
      } else if (symbol == "ø" && typeof toggleSecretDemo == "function") {
        toggleSecretDemo();
      }
    },
    true,
  );
  scene.text.input.addEventListener(
    "input",
    (event) => {
      let symbol = ["π", "ø"].find((value) =>
        scene.text.input.value.includes(value)
      );
      if (symbol == null) return;
      scene.text.input.value = scene.text.input.value.replaceAll(symbol, "");
      let position = scene.text.input.value.length;
      scene.text.input.setSelectionRange(position, position);
      event.stopImmediatePropagation();
      if (symbol == "π" && typeof toggleSecretSessionMode == "function") {
        toggleSecretSessionMode();
      } else if (symbol == "ø" && typeof toggleSecretDemo == "function") {
        toggleSecretDemo();
      }
    },
    true,
  );
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

  clearTextSelectionOverride();

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
  prefetchTextGlyphsForCurrentWords();
  syncTextCursorFromInput();
  saveTextMemory();
  recordEditorHistory();
}

function syncTextCursorFromInput(event) {
  if (scene.text.input == null) return;
  if (event != null) clearTextSelectionOverride();
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
  clearTextSelectionOverride();
  syncInputFromText();
  scene.text.input.focus({ preventScroll: true });
}

function textSelectionState() {
  let override = scene.text.selectionOverride;
  if (override != null) {
    return {
      start: constrain(override.start, 0, scene.text.buffer.length),
      end: constrain(override.end, 0, scene.text.buffer.length),
      direction: override.direction || "forward",
    };
  }

  let start = scene.text.input?.selectionStart ?? scene.text.cursor.pos;
  let end = scene.text.input?.selectionEnd ?? start;
  return {
    start,
    end,
    direction: scene.text.input?.selectionDirection || "forward",
  };
}

function clearTextSelectionOverride() {
  scene.text.selectionOverride = null;
}

function setTextCursor(pos) {
  setTextSelection(pos, pos);
}

function setTextSelection(anchor, focus) {
  clearTextSelectionOverride();
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
  let nextEdit = Boolean(value);
  let editChanged = scene.text.edit != nextEdit;
  let from = editChanged
    ? creationCardBounds(
      width,
      height,
      scene.ui.controlSide,
      scene.text.edit,
    )
    : null;
  if (!value) {
    let leadingSpaceCount = scene.text.buffer.length - scene.text.buffer.trimStart().length;
    scene.text.buffer = cleanTextInput(scene.text.buffer).trim();
    scene.text.cursor.pos = constrain(
      scene.text.cursor.pos - leadingSpaceCount,
      0,
      scene.text.buffer.length,
    );
  }

  scene.text.edit = nextEdit;
  if (editChanged) {
    let to = creationCardBounds(
      width,
      height,
      scene.ui.controlSide,
      scene.text.edit,
    );
    remapArtworkBetweenBounds(from, to);
  }
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
    if (typeof syncLayerOrder == "function") syncLayerOrder();
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
      backgroundPaletteIndex: scene.ui.colorPanel.selectedPaletteIndex,
      backgroundFrameIndex: scene.session.backgroundFrameIndex,
      textureMixes: { ...scene.text.textureMixes },
      textureShuffleSeed: scene.text.textureShuffleSeed,
      layerOrder: [...scene.text.layerOrder],
      editing: scene.text.edit,
      canvasWidth: width,
      canvasHeight: height,
      compositionVersion: 2,
      paths,
    };
    localStorage.setItem(scene.text.storageKey, JSON.stringify(memory));
    scene.text.hasSavedSession = true;
  } catch (error) {
    console.warn("Unable to save text memory", error);
  }
}

function loadTextMemory() {
  scene.text.hasSavedSession = false;
  try {
    let raw = localStorage.getItem(scene.text.storageKey);
    if (raw == null) {
      return;
    }

    let memory = JSON.parse(raw);
    scene.text.hasSavedSession = true;
    scene.text.buffer = typeof memory.buffer == "string" ? memory.buffer : "";
    scene.text.cursor.pos = constrain(
      memory.cursorPos || scene.text.buffer.length,
      0,
      scene.text.buffer.length,
    );
    scene.text.cursor.preferredColumn = currentColumn();
    if (Number.isFinite(memory.backgroundPaletteIndex)) {
      setSessionBackgroundPalette(memory.backgroundPaletteIndex, true);
    }
    if (Number.isInteger(memory.backgroundFrameIndex)) {
      scene.session.backgroundFrameIndex = constrain(
        memory.backgroundFrameIndex,
        0,
        PLAYSPACE_FLOW_BACKGROUND_PATHS.length - 1,
      );
    }
    scene.text.textureMixes = Object.create(null);
    scene.text.textureShuffleSeed = Number.isInteger(memory.textureShuffleSeed)
      ? memory.textureShuffleSeed
      : 1;
    if (memory.textureMixes != null && typeof memory.textureMixes == "object") {
      for (let [wordKey, mix] of Object.entries(memory.textureMixes)) {
        if (mix == null || typeof mix != "object") continue;
        scene.text.textureMixes[wordKey] = cleanStoredTextureMix(mix);
      }
    } else if (memory.textureMix != null && typeof memory.textureMix == "object") {
      let mix = cleanStoredTextureMix(memory.textureMix);
      for (let entry of textWordEntries()) {
        scene.text.textureMixes[entry.key] = { ...mix };
      }
    }
    scene.text.layerOrder = Array.isArray(memory.layerOrder)
      ? memory.layerOrder.filter((key) => typeof key == "string")
      : ["photo"];
    scene.text.edit = memory.editing === true;
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
    if (memory.canvasWidth > 0 && memory.canvasHeight > 0) {
      let storedEditing = memory.editing === true;
      let from = memory.compositionVersion === 2
        ? creationCardBounds(
          memory.canvasWidth,
          memory.canvasHeight,
          scene.ui.controlSide,
          storedEditing,
        )
        : memory.compositionVersion === 1
        ? compositionBounds(
          memory.canvasWidth,
          memory.canvasHeight,
          scene.ui.controlSide,
          storedEditing,
        )
        : {
          x: 0,
          y: 0,
          width: memory.canvasWidth,
          height: memory.canvasHeight,
        };
      let to = creationCardBounds(
        width,
        height,
        scene.ui.controlSide,
        storedEditing,
      );
      remapTextPathsBetweenBounds(from, to);
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
  scene.session.backgroundFrameIndex = null;
  scene.text.buffer = "";
  scene.text.cursor.pos = 0;
  scene.text.cursor.preferredColumn = 0;
  scene.text.paths = Object.create(null);
  scene.text.renderPathCache = new WeakMap();
  scene.text.glyphAssets.assignmentCache = Object.create(null);
  scene.text.colors = Object.create(null);
  scene.text.sizes = Object.create(null);
  scene.text.sizeAnimations = Object.create(null);
  scene.text.textureMixes = Object.create(null);
  scene.text.textureShuffleSeed = nextTextTextureShuffleSeed();
  scene.text.layerOrder = ["photo"];
  scene.ui.layerBar.selectedKey = null;
  scene.ui.layerBar.dragging = false;
  scene.text.activeWord = -1;
  scene.text.pathEditArmed = false;
  clearTextSelectionOverride();
  syncInputFromText();

  discardSavedTextMemory();
  clearEditorHistory();
}

function editorHistorySnapshot() {
  let paths = Object.create(null);
  for (let [key, path] of Object.entries(scene.text.paths)) {
    if (!Array.isArray(path)) continue;
    paths[key] = path.map((point) => ({ x: point.x, y: point.y }));
  }
  return {
    buffer: scene.text.buffer,
    cursorPos: scene.text.cursor.pos,
    paths,
    colors: JSON.parse(JSON.stringify(scene.text.colors)),
    sizes: { ...scene.text.sizes },
    textureMixes: JSON.parse(JSON.stringify(scene.text.textureMixes)),
    textureShuffleSeed: scene.text.textureShuffleSeed,
    layerOrder: [...scene.text.layerOrder],
    backgroundColor: { ...scene.session.backgroundColor },
    backgroundPaletteIndex: scene.ui.colorPanel.selectedPaletteIndex,
    selectedKey: scene.ui.layerBar.selectedKey,
  };
}

function editorHistorySnapshotKey(snapshot) {
  return JSON.stringify(snapshot);
}

function clearEditorHistory() {
  let history = scene.ui?.editorHistory;
  if (history == null) return;
  history.past = [];
  history.future = [];
  history.lastKey = "";
  history.restoring = false;
}

function resetEditorHistory() {
  clearEditorHistory();
  recordEditorHistory();
}

function recordEditorHistory() {
  let history = scene.ui.editorHistory;
  if (history.restoring || scene.session.mode != "active") return false;
  let snapshot = editorHistorySnapshot();
  let key = editorHistorySnapshotKey(snapshot);
  if (key == history.lastKey) return false;
  history.past.push(snapshot);
  if (history.past.length > history.limit) history.past.shift();
  history.future = [];
  history.lastKey = key;
  return true;
}

function restoreEditorHistorySnapshot(snapshot) {
  if (snapshot == null) return false;
  let history = scene.ui.editorHistory;
  history.restoring = true;
  try {
    scene.text.buffer = snapshot.buffer;
    scene.text.cursor.pos = constrain(
      snapshot.cursorPos,
      0,
      scene.text.buffer.length,
    );
    scene.text.paths = Object.create(null);
    for (let [key, path] of Object.entries(snapshot.paths || {})) {
      scene.text.paths[key] = path.map((point) =>
        createVector(point.x, point.y)
      );
    }
    scene.text.renderPathCache = new WeakMap();
    scene.text.colors = Object.assign(
      Object.create(null),
      JSON.parse(JSON.stringify(snapshot.colors || {})),
    );
    scene.text.sizes = Object.assign(
      Object.create(null),
      snapshot.sizes || {},
    );
    scene.text.textureMixes = Object.assign(
      Object.create(null),
      JSON.parse(JSON.stringify(snapshot.textureMixes || {})),
    );
    scene.text.textureShuffleSeed = Number.isInteger(
      snapshot.textureShuffleSeed,
    )
      ? snapshot.textureShuffleSeed
      : 1;
    scene.text.glyphAssets.assignmentCache = Object.create(null);
    scene.text.layerOrder = [...(snapshot.layerOrder || [])];
    scene.session.backgroundColor = { ...snapshot.backgroundColor };
    scene.ui.colorPanel.selectedPaletteIndex =
      snapshot.backgroundPaletteIndex;
    scene.ui.layerBar.selectedKey = snapshot.selectedKey;
    scene.text.activeWord = layerItemForKey(snapshot.selectedKey)?.wordIndex ??
      firstWordWithoutPath();
    scene.text.pathEditArmed = scene.text.activeWord >= 0;
    syncInputFromText();
    syncLayerOrder();
    saveTextMemory();
    scheduleSessionCacheSave();
  } finally {
    history.restoring = false;
  }
  history.lastKey = editorHistorySnapshotKey(snapshot);
  return true;
}

function undoEditorChange() {
  let history = scene.ui.editorHistory;
  if (history.past.length <= 1) return false;
  history.future.push(history.past.pop());
  return restoreEditorHistorySnapshot(history.past[history.past.length - 1]);
}

function redoEditorChange() {
  let history = scene.ui.editorHistory;
  if (history.future.length == 0) return false;
  let snapshot = history.future.pop();
  history.past.push(snapshot);
  return restoreEditorHistorySnapshot(snapshot);
}

function clearAllTextPaths() {
  if (Object.keys(scene.text.paths).length == 0) return false;
  scene.text.paths = Object.create(null);
  scene.text.renderPathCache = new WeakMap();
  scene.text.activeWord = firstWordWithoutPath();
  scene.text.pathEditArmed = scene.text.activeWord >= 0;
  scene.ui.layerBar.selectedKey =
    textWordEntries()[scene.text.activeWord]?.key ?? null;
  saveTextMemory();
  recordEditorHistory();
  return true;
}

function discardSavedTextMemory() {
  scene.text.hasSavedSession = false;
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
  return textureMixTextColor(textureMixForWordIndex(wordIndex));
}

function defaultTextureMix() {
  return { x: 0.5, y: 0.5 };
}

function cleanStoredTextureMix(mix) {
  if (mix == null || typeof mix != "object") return defaultTextureMix();
  return {
    x: constrain(Number.isFinite(mix.x) ? mix.x : 0.5, 0, 1),
    y: constrain(Number.isFinite(mix.y) ? mix.y : 0.5, 0, 1),
  };
}

function textureMixForWordIndex(wordIndex) {
  let entry = textWordEntries()[wordIndex];
  if (entry == null) return defaultTextureMix();
  return scene.text.textureMixes[entry.key] || defaultTextureMix();
}

function textureMixRgbValues(mix) {
  let x = constrain(mix?.x ?? 0.5, 0, 1);
  let y = constrain(mix?.y ?? 0.5, 0, 1);
  let cyan = [0, 1, 1];
  let magenta = [1, 0, 1];
  let yellow = [1, 1, 0];
  let grey = [0.5, 0.5, 0.5];

  return cyan.map((channel, index) => {
    let top = lerp(channel, magenta[index], x);
    let bottom = lerp(yellow[index], grey[index], x);
    return lerp(top, bottom, y);
  });
}

function textureMixTextColor(mix) {
  return rgbToHsvValues(textureMixRgbValues(mix));
}

function selectedTextWordIndexes() {
  let entries = textWordEntries();
  let selection = textSelectionState();
  let selectionStart = selection.start;
  let selectionEnd = selection.end;
  let selectionFrom = min(selectionStart, selectionEnd);
  let selectionTo = max(selectionStart, selectionEnd);

  if (selectionFrom == selectionTo) {
    return scene.text.activeWord >= 0 ? [scene.text.activeWord] : [];
  }

  return entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => {
      return entry.start < selectionTo && entry.end > selectionFrom;
    })
    .map(({ index }) => index);
}

function setTextureMixForWordIndex(wordIndex, x, y, save = true) {
  let entry = textWordEntries()[wordIndex];
  if (entry == null) return false;
  scene.text.textureMixes[entry.key] = {
    x: constrain(x, 0, 1),
    y: constrain(y, 0, 1),
  };
  if (save) saveTextMemory();
  return true;
}

function setTextureMixForSelectedWords(x, y) {
  let changed = false;
  for (let wordIndex of selectedTextWordIndexes()) {
    changed = setTextureMixForWordIndex(wordIndex, x, y, false) || changed;
  }
  if (changed) saveTextMemory();
  return changed;
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
  let card = creationCardBounds();
  let cardScale = min(
    card.width / scene.creationCard.width,
    card.height / scene.creationCard.height,
  );
  let scaleRange = scene.content.text.scaleRange * cardScale;
  let target = map(
    value,
    0,
    1,
    -scaleRange,
    scaleRange,
  );
  if (entry == null) {
    return (baseSize + target) * scene.content.text.glyphScale;
  }

  let current = scene.text.sizeAnimations[entry.key];
  if (!Number.isFinite(current)) current = target;
  current = animateData(current, target, scene.content.text.scaleSmooth);
  scene.text.sizeAnimations[entry.key] = current;
  return (baseSize + current) * scene.content.text.glyphScale;
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
  let previousPath = scene.text.paths[entry.key];
  if (previousPath != null) scene.text.renderPathCache.delete(previousPath);
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
  let entry = textWordEntries()[scene.text.activeWord];
  scene.ui.layerBar.selectedKey = entry?.key ?? null;
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
  return {
    ...textureMixTextColor(textureMixForWordIndex(wordIndex)),
    opacity: wordIndex < 0 ? 0.5 : 0.8,
  };
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

function textFieldPlaceholderOffsets(label) {
  let words = label.split(" ");
  let wordDelay = 0.16;
  let jumpDuration = 0.42;
  let cycleDuration =
    max(1, words.length) * wordDelay + jumpDuration + 0.7;
  let cycleTime = scene.elapsedTime % cycleDuration;
  let offsets = [];

  for (let i = 0; i < words.length; i++) {
    let wordTime = cycleTime - i * wordDelay;
    let jump =
      wordTime >= 0 && wordTime <= jumpDuration
        ? sin((wordTime / jumpDuration) * 180) * 0.18
        : 0;

    for (
      let characterIndex = 0;
      characterIndex < words[i].length;
      characterIndex++
    ) {
      offsets.push({ x: 0, y: -jump });
    }
    if (i < words.length - 1) {
      offsets.push({ x: 0, y: 0 });
    }
  }

  return offsets;
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

  if (scene.text.buffer.length == 0) {
    let placeholder = "type your name here";
    let characterCount = Array.from(placeholder).length;
    scene.ui.textField.display = {
      start: 0,
      end: 0,
      label: placeholder,
      leftEllipsis: false,
      rightEllipsis: false,
    };
    scene.ui.textField.opacity = Array(characterCount).fill(127.5);
    scene.ui.textField.scales = Array(characterCount).fill(1);
    scene.ui.textField.rotations = Array(characterCount).fill(0);
    scene.ui.textField.offsets = textFieldPlaceholderOffsets(placeholder);
    scene.ui.textField.selection = {
      start: 0,
      end: 0,
      caret: true,
      gradientStart: 0,
      gradientEnd: characterCount,
      colorStops: textFieldSelectionStops(0, 0),
    };
    return placeholder;
  }

  let selection = textSelectionState();
  let selectionStart = selection.start;
  let selectionEnd = selection.end;
  let selectionDirection = selection.direction;
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

function textRenderBasePath(path) {
  let cached = scene.text.renderPathCache.get(path);
  if (cached?.sourceLength == path.length) return cached.points;

  let points = smoothPath(path);
  let maximumPoints = 160;
  if (points.length > maximumPoints) {
    let sourcePoints = points;
    points = Array.from({ length: maximumPoints }, (_, index) => {
      let sourceIndex = round(map(
        index,
        0,
        maximumPoints - 1,
        0,
        sourcePoints.length - 1,
      ));
      return sourcePoints[sourceIndex];
    });
  }
  scene.text.renderPathCache.set(path, {
    sourceLength: path.length,
    points,
  });
  return points;
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

function drawSvgContourSet(gfx, glyph, contours, scaleValue, scaleMultiplier = 1) {
  gfx.push();
  gfx.translate(gfx.width / 2, gfx.height / 2);
  gfx.scale(scaleValue * scaleMultiplier);
  gfx.translate(-glyph.center.x, -glyph.center.y);

  for (let i = 0; i < contours.length; i++) {
    if (glyph.hierarchy.depths[i] % 2 != 0) continue;

    gfx.beginShape();
    for (let point of contours[i]) gfx.vertex(point.x, point.y);

    for (let hole = 0; hole < contours.length; hole++) {
      if (
        glyph.hierarchy.parents[hole] != i ||
        glyph.hierarchy.depths[hole] % 2 == 0
      ) {
        continue;
      }
      gfx.beginContour();
      for (let point of contours[hole]) gfx.vertex(point.x, point.y);
      gfx.endContour();
    }

    gfx.endShape(CLOSE);
  }

  gfx.pop();
}

function drawSvgGlyph(
  gfx,
  glyph,
  size,
  seed,
  wiggle = true,
  color = defaultTextColor(),
  textureMix = null,
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
  buffer.noStroke();
  fillWorkspaceText(
    buffer,
    textureMix == null ? color : defaultTextColor(),
  );
  drawSvgContourSet(buffer, glyph, contours, scaleValue);

  let texturedBuffer = textTextureBuffer(buffer, seed, textureMix);
  let borderBuffer = texturedBuffer == null
    ? null
    : tornTextBorderBuffer(glyph, size, seed, wiggle);
  gfx.imageMode(CENTER);
  if (borderBuffer != null) {
    gfx.image(borderBuffer, 0, 0, bufferSize, bufferSize);
  }
  gfx.image(texturedBuffer || buffer, 0, 0, bufferSize, bufferSize);
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
  textureMix = null,
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
      textureMix,
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
