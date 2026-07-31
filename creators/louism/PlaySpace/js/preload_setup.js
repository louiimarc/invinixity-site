function preload() {
  data.amount = 3 + (demo ? 0 : 2) + svgGlyphCharacters().length;
  scene.font = loadFont("assets/font/Nunito-Bold.ttf", loaded);
  scene.text.font = loadFont("assets/font/Humanize.ttf", loaded);
  scene.shader = loadShader("shader/vert.glsl", "shader/frag.glsl", loaded);
  if (!demo) {
    scene.panelShader = loadShader(
      "shader/vert.glsl",
      "shader/frag.glsl",
      loaded,
    );
    scene.colorWheelShader = loadShader(
      "shader/vert.glsl",
      "shader/color_wheel.glsl",
      loaded,
    );
  }
}

function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
  pixelDensity(1);
  smooth();
  angleMode(DEGREES);
  textFont(scene.font);
  updateUiScale();
  setupTextInput();
  loadTextMemory();
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

  scene.gui = {
    save: new GraphicalUserInterface("Save", scene.workspace, scene.shader),
    edit: new GraphicalUserInterface("Edit", scene.workspace, scene.shader),
    done: new GraphicalUserInterface("Done", scene.workspace, scene.shader),
    contentScale: new GraphicalUserInterface("", scene.workspace, scene.shader),
  };
  if (demo) {
    scene.gui.hue = new GraphicalUserInterface(
      "Hue",
      scene.workspace,
      scene.shader,
    );
    scene.gui.saturation = new GraphicalUserInterface(
      "Saturation",
      scene.workspace,
      scene.shader,
    );
    scene.gui.brightness = new GraphicalUserInterface(
      "Brightness",
      scene.workspace,
      scene.shader,
    );
  } else {
    scene.gui.colorPanel = new GraphicalUserInterface(
      "",
      scene.workspace,
      scene.panelShader,
    );
    scene.gui.red = new GraphicalUserInterface(
      "Red",
      scene.workspace,
      scene.shader,
    );
    scene.gui.green = new GraphicalUserInterface(
      "Green",
      scene.workspace,
      scene.shader,
    );
    scene.gui.blue = new GraphicalUserInterface(
      "Blue",
      scene.workspace,
      scene.shader,
    );
  }
  scene.gui.save.anchor = "left";
  scene.gui.edit.anchor = "right";
  scene.gui.done.anchor = "right";
  scene.gui.contentScale.marks.top = "+";
  scene.gui.contentScale.marks.bottom = "-";
  if (demo) {
    scene.gui.hue.anchor = "left";
    scene.gui.saturation.anchor = "left";
    scene.gui.brightness.anchor = "left";
    scene.gui.hue.valueVisible = true;
    scene.gui.hue.valueMaximum = 360;
    scene.gui.hue.valueUnit = "º";
    scene.gui.saturation.valueVisible = true;
    scene.gui.saturation.valueUnit = "%";
    scene.gui.brightness.valueVisible = true;
    scene.gui.brightness.valueUnit = "%";
  } else {
    scene.gui.colorPanel.tiltEnabled = false;
    for (let channel of ["red", "green", "blue"]) {
      scene.gui[channel].valueVisible = true;
      scene.gui[channel].valueMaximum = 255;
    }
  }

  data.loading.interface = new GraphicalUserInterface(
    "Loading",
    scene.workspace,
    scene.shader,
  );

  loadSvgGlyphs();

  inout.audio.setup();
  inout.audio.ui = new UiSoundEngine();
}

function loadSvgGlyphs() {
  for (let char of svgGlyphCharacters()) {
    let filename = svgGlyphFilename(char);
    loadStrings(
      `assets/font/Humanize-SVG/${filename}`,
      (source) => {
        scene.text.svg.sources[char] = source;
        prepareSvgGlyph(char);
        loaded();
      },
      (error) => {
        console.warn(`Unable to load SVG glyph ${char}`, error);
        loaded();
      },
    );
  }
}

function loaded() {
  data.counter = min(data.counter + 1, data.amount);
  data.loading.status = data.counter < data.amount;
}
