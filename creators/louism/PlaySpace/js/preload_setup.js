function preload() {
  data.amount = 12;
  preloadFlowUiAssets();
  scene.font = loadFont("assets/fonts/Nunito-Bold.ttf", loaded);
  scene.text.font = loadFont("assets/fonts/Humanize.ttf", loaded);
  scene.shader = loadShader("shader/vert.glsl", "shader/frag.glsl", loaded);
  preloadFrameOverlayAssets();
  preloadSecretSessionNames();
  preloadHomeGalleryAssets();
  loadStrings(
    scene.session.camera.captureLabelPath,
    (lines) => {
      let labels = lines.map((line) => line.trim()).filter((line) => line != "");
      if (labels.length > 0) scene.session.camera.captureLabels = labels;
      loaded();
    },
    (error) => {
      console.warn("Unable to load camera capture labels", error);
      loaded();
    },
  );
  inout.audio.cameraShutter = loadSound(
    "assets/audio/camera_capture.m4a",
    loaded,
    (error) => {
      console.warn("Unable to load camera shutter sound", error);
      loaded();
    },
  );
}

function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
  pixelDensity(1);
  frameRate(120);
  smooth();
  angleMode(DEGREES);
  textFont(scene.font);
  updateUiScale();
  setupTextInput();
  loadControlSidePreference();
  loadTextMemory();
  data.amount++;
  data.loading.status = true;
  restoreSessionCache().finally(loaded);
  data.loading.startedAt = millis() / 1000.0;
  data.loading.position.y = -height;

  scene.workspace = createGraphics(
    width * scene.pixScale,
    height * scene.pixScale,
    WEBGL,
  );
  scene.workspace.pixelDensity(1);
  scene.workspace.smooth();
  scene.workspace.angleMode(DEGREES);
  scene.workspace.textFont(scene.text.font);
  setupTextGlyphAssets();
  prefetchTextGlyphsForCurrentWords();
  setupHomeGallery();
  restoreDownloadHandoff();

  scene.gui = {
    print: new GraphicalUserInterface("Finish", scene.workspace, scene.shader),
    edit: new GraphicalUserInterface("Edit", scene.workspace, scene.shader),
    done: new GraphicalUserInterface("Done", scene.workspace, scene.shader),
    sideSwitch: new GraphicalUserInterface(
      "<",
      scene.workspace,
      scene.shader,
    ),
    texturePanel: new GraphicalUserInterface("", scene.workspace, scene.shader),
    layerPanel: new GraphicalUserInterface("", scene.workspace, scene.shader),
    printTitle: new GraphicalUserInterface(
      "Card Preview",
      scene.workspace,
      scene.shader,
    ),
    printCancel: new GraphicalUserInterface(
      "Cancel",
      scene.workspace,
      scene.shader,
    ),
    printOk: new GraphicalUserInterface("Finish", scene.workspace, scene.shader),
    cameraTitle: new GraphicalUserInterface(
      "Take a Picture",
      scene.workspace,
      scene.shader,
    ),
    cameraTake: new GraphicalUserInterface(
      "Take",
      scene.workspace,
      scene.shader,
    ),
    cameraNext: new GraphicalUserInterface(
      "Next",
      scene.workspace,
      scene.shader,
    ),
    cameraCancel: new GraphicalUserInterface(
      "Cancel",
      scene.workspace,
      scene.shader,
    ),
    cameraExit: new GraphicalUserInterface(
      "Exit",
      scene.workspace,
      scene.shader,
    ),
    cameraExitCancel: new GraphicalUserInterface(
      "Cancel",
      scene.workspace,
      scene.shader,
    ),
    cameraExitYes: new GraphicalUserInterface(
      "Yes",
      scene.workspace,
      scene.shader,
    ),
    frameTitle: new GraphicalUserInterface(
      "Draw Your Frame",
      scene.workspace,
      scene.shader,
    ),
    frameExit: new GraphicalUserInterface(
      "Exit",
      scene.workspace,
      scene.shader,
    ),
    frameNext: new GraphicalUserInterface(
      "Next",
      scene.workspace,
      scene.shader,
    ),
    frameRedraw: new GraphicalUserInterface(
      "Redraw",
      scene.workspace,
      scene.shader,
    ),
    editorUndo: new GraphicalUserInterface(
      "Undo",
      scene.workspace,
      scene.shader,
    ),
    editorRedo: new GraphicalUserInterface(
      "Redo",
      scene.workspace,
      scene.shader,
    ),
    editorDelete: new GraphicalUserInterface(
      "Delete",
      scene.workspace,
      scene.shader,
    ),
    backgroundCancel: new GraphicalUserInterface(
      "Cancel",
      scene.workspace,
      scene.shader,
    ),
    backgroundNext: new GraphicalUserInterface(
      "Next",
      scene.workspace,
      scene.shader,
    ),
  };
  scene.gui.print.anchor = "left";
  scene.gui.edit.anchor = "right";
  scene.gui.done.anchor = "right";
  scene.gui.sideSwitch.tiltEnabled = false;
  scene.gui.texturePanel.tiltEnabled = false;
  scene.gui.layerPanel.tiltEnabled = false;
  scene.gui.printTitle.tiltEnabled = false;
  scene.gui.printCancel.anchor = "right";
  scene.gui.printOk.anchor = "left";
  scene.gui.cameraTitle.tiltEnabled = false;
  scene.gui.cameraTake.tiltEnabled = false;
  scene.gui.cameraNext.tiltEnabled = false;
  scene.gui.cameraCancel.tiltEnabled = false;
  scene.gui.cameraExit.tiltEnabled = false;
  scene.gui.cameraExitCancel.tiltEnabled = false;
  scene.gui.cameraExitYes.tiltEnabled = false;
  scene.gui.frameTitle.tiltEnabled = false;
  scene.gui.frameExit.tiltEnabled = false;
  scene.gui.frameNext.tiltEnabled = false;
  scene.gui.frameRedraw.tiltEnabled = false;
  scene.gui.editorUndo.tiltEnabled = false;
  scene.gui.editorRedo.tiltEnabled = false;
  scene.gui.editorDelete.tiltEnabled = false;
  data.loading.interface = new GraphicalUserInterface(
    "Loading",
    scene.workspace,
    scene.shader,
  );

  inout.audio.setup();
  inout.audio.ui = new UiSoundEngine();
}

function loaded() {
  data.counter = min(data.counter + 1, data.amount);
  data.loading.status = data.counter < data.amount;
}
