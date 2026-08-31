const PLAYSPACE_CREATION_RECIPE_VERSION = 1;

function creationRecipeClamp(value, minimum = 0, maximum = 1) {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

function creationRecipePoint(point) {
  if (point == null || typeof point != "object") return null;
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  return {
    x: creationRecipeClamp(point.x),
    y: creationRecipeClamp(point.y),
  };
}

function cleanCreationRecipePath(path, minimumPoints = 1) {
  if (!Array.isArray(path)) return [];
  let cleaned = path.map(creationRecipePoint).filter((point) => point != null);
  return cleaned.length >= minimumPoints ? cleaned : [];
}

function normalizeCreationRecipePoint(point, bounds) {
  return {
    x: creationRecipeClamp((point.x - bounds.x) / Math.max(1, bounds.width)),
    y: creationRecipeClamp((point.y - bounds.y) / Math.max(1, bounds.height)),
  };
}

function creationRecipeWordKey(word, occurrence) {
  return `${word}_${occurrence}`;
}

function creationRecipeNamePattern(name) {
  let words = name.match(/\S+/g) || [];
  return {
    characterCount: Array.from(name.replace(/\s/g, "")).length,
    wordLengths: words.map((word) => Array.from(word).length),
  };
}

function cleanCreationRecipe(input) {
  if (input == null || typeof input != "object") return null;
  if (input.version !== PLAYSPACE_CREATION_RECIPE_VERSION) return null;

  let name = typeof input.name == "string"
    ? input.name.replace(/\s+/g, " ").trim().slice(0, 64)
    : "";
  let frame = cleanCreationRecipePath(input.frame?.points, 3);
  if (name == "" || frame.length < 3) return null;

  let words = [];
  let occurrences = Object.create(null);
  for (let word of name.match(/\S+/g) || []) {
    occurrences[word] = (occurrences[word] || 0) + 1;
    let key = creationRecipeWordKey(word, occurrences[word]);
    let stored = Array.isArray(input.words)
      ? input.words.find((entry) => entry?.key == key)
      : null;
    if (stored == null) continue;
    let path = cleanCreationRecipePath(stored.path, 1);
    if (path.length == 0) continue;
    words.push({
      key,
      word,
      occurrence: occurrences[word],
      path,
      size: creationRecipeClamp(stored.size ?? 0.5),
      texture: {
        x: creationRecipeClamp(stored.texture?.x ?? 0.5),
        y: creationRecipeClamp(stored.texture?.y ?? 0.5),
      },
    });
  }

  let validLayerKeys = new Set(["photo", ...words.map((word) => word.key)]);
  let layerOrder = [];
  for (let key of Array.isArray(input.layerOrder) ? input.layerOrder : []) {
    if (validLayerKeys.has(key) && !layerOrder.includes(key)) {
      layerOrder.push(key);
    }
  }
  for (let key of validLayerKeys) {
    if (!layerOrder.includes(key)) layerOrder.push(key);
  }

  return {
    version: PLAYSPACE_CREATION_RECIPE_VERSION,
    id: typeof input.id == "string" ? input.id.slice(0, 128) : "",
    createdAt: Number.isFinite(input.createdAt) ? input.createdAt : Date.now(),
    name,
    namePattern: creationRecipeNamePattern(name),
    background: {
      paletteIndex: Math.max(0, Math.round(input.background?.paletteIndex ?? 0)),
    },
    frame: {
      points: frame,
      photoPlacement: input.frame?.photoPlacement == null
        ? null
        : {
          x: creationRecipeClamp(input.frame.photoPlacement.x),
          y: creationRecipeClamp(input.frame.photoPlacement.y),
          width: Math.max(0, input.frame.photoPlacement.width || 0),
          height: Math.max(0, input.frame.photoPlacement.height || 0),
        },
    },
    words,
    layerOrder,
    special: input.special == null
      ? null
      : {
        facePath: typeof input.special.facePath == "string"
          ? input.special.facePath
          : "",
        faceGender: ["female", "male", "inBetween"].includes(
          input.special.faceGender,
        )
          ? input.special.faceGender
          : "inBetween",
      },
  };
}

class CreationRecipeRecorder {
  capture(options = {}) {
    let bounds = compositionBounds();
    let entries = textWordEntries();
    let words = [];

    for (let [wordIndex, entry] of entries.entries()) {
      let path = textPathForWordIndex(wordIndex);
      if (!Array.isArray(path) || path.length == 0) continue;
      let texture = textureMixForWordIndex(wordIndex);
      words.push({
        key: entry.key,
        word: entry.word,
        occurrence: entry.occurrence,
        path: path.map((point) => normalizeCreationRecipePoint(point, bounds)),
        size: textScaleValueForWordIndex(wordIndex),
        texture: { x: texture.x, y: texture.y },
      });
    }

    let recipe = {
      version: PLAYSPACE_CREATION_RECIPE_VERSION,
      id: typeof options.id == "string" ? options.id : "",
      createdAt: Number.isFinite(options.createdAt)
        ? options.createdAt
        : Date.now(),
      name: scene.text.buffer,
      background: {
        paletteIndex: frameOverlayPaletteIndex(),
      },
      frame: {
        points: scene.session.photoFrame.points.map((point) =>
          normalizeCreationRecipePoint(point, bounds)
        ),
        photoPlacement: scene.session.photoFrame.photoPlacement == null
          ? null
          : {
            x: (scene.session.photoFrame.photoPlacement.x - bounds.x) /
              Math.max(1, bounds.width),
            y: (scene.session.photoFrame.photoPlacement.y - bounds.y) /
              Math.max(1, bounds.height),
            width: scene.session.photoFrame.photoPlacement.width /
              Math.max(1, bounds.width),
            height: scene.session.photoFrame.photoPlacement.height /
              Math.max(1, bounds.height),
          },
      },
      words,
      layerOrder: [...syncLayerOrder()],
    };

    return cleanCreationRecipe(recipe);
  }
}

function creationDemoPhaseDuration(phase, recipe) {
  if (phase == "frame") return creationRecipeClamp(
    recipe.frame.points.length * 18,
    1100,
    3000,
  );
  if (phase == "typing") return creationRecipeClamp(
    recipe.name.length * 80,
    700,
    2200,
  );
  if (phase == "words") return creationRecipeClamp(
    recipe.words.length * 850,
    850,
    4200,
  );
  if (phase == "color") return 1400;
  if (phase == "texture") return creationRecipeClamp(
    recipe.words.length * 550,
    700,
    3000,
  );
  if (phase == "layers") return creationRecipeClamp(
    recipe.layerOrder.length * 350,
    700,
    2400,
  );
  return 2600;
}

function creationDemoEase(progress) {
  let value = creationRecipeClamp(progress);
  return value * value * (3 - 2 * value);
}

class CreationDemoPlayer {
  constructor(options = {}) {
    this.onUpdate = typeof options.onUpdate == "function"
      ? options.onUpdate
      : null;
    this.onComplete = typeof options.onComplete == "function"
      ? options.onComplete
      : null;
    this.phases = [
      "frame",
      "typing",
      "words",
      "color",
      "texture",
      "layers",
      "reveal",
    ];
    this.reset();
  }

  reset() {
    this.recipe = null;
    this.photo = null;
    this.active = false;
    this.phaseIndex = 0;
    this.phaseElapsed = 0;
    this.state = null;
  }

  load(recipe, photo = null) {
    let cleaned = cleanCreationRecipe(recipe);
    if (cleaned == null) throw new Error("Invalid PlaySpace creation recipe");
    this.reset();
    this.recipe = cleaned;
    this.photo = photo;
    this.state = this.presentationState(0);
    return cleaned;
  }

  start() {
    if (this.recipe == null) return false;
    this.active = true;
    this.phaseIndex = 0;
    this.phaseElapsed = 0;
    this.state = this.presentationState(0);
    this.onUpdate?.(this.state, this);
    return true;
  }

  stop() {
    this.active = false;
  }

  update(deltaMilliseconds) {
    if (!this.active || this.recipe == null) return this.state;
    let remaining = Math.max(0, Number(deltaMilliseconds) || 0);

    while (remaining > 0 && this.active) {
      let phase = this.phases[this.phaseIndex];
      let duration = creationDemoPhaseDuration(phase, this.recipe);
      let available = duration - this.phaseElapsed;
      let step = Math.min(remaining, available);
      this.phaseElapsed += step;
      remaining -= step;

      if (this.phaseElapsed >= duration) {
        if (this.phaseIndex >= this.phases.length - 1) {
          this.active = false;
          this.state = this.presentationState(1);
          this.onUpdate?.(this.state, this);
          this.onComplete?.(this.recipe, this);
          return this.state;
        }
        this.phaseIndex++;
        this.phaseElapsed = 0;
      }
    }

    let phase = this.phases[this.phaseIndex];
    let duration = creationDemoPhaseDuration(phase, this.recipe);
    this.state = this.presentationState(this.phaseElapsed / duration);
    this.onUpdate?.(this.state, this);
    return this.state;
  }

  presentationState(rawProgress) {
    let phase = this.phases[this.phaseIndex];
    let progress = creationDemoEase(rawProgress);
    let completed = new Set(this.phases.slice(0, this.phaseIndex));
    let wordCount = this.recipe?.words.length || 0;
    let layerCount = this.recipe?.layerOrder.length || 0;
    let activeWordProgress = phase == "words" ? progress * wordCount : 0;
    let activeTextureProgress = phase == "texture" ? progress * wordCount : 0;

    return {
      phase,
      phaseIndex: this.phaseIndex,
      progress,
      frameProgress: completed.has("frame") ? 1 : phase == "frame" ? progress : 0,
      typedCharacters: completed.has("typing")
        ? this.recipe?.name.length || 0
        : phase == "typing"
          ? Math.floor(progress * (this.recipe?.name.length || 0))
          : 0,
      visibleWords: completed.has("words")
        ? wordCount
        : phase == "words"
          ? Math.min(wordCount, Math.floor(activeWordProgress) + 1)
          : 0,
      wordPathProgress: phase == "words" ? activeWordProgress % 1 : 1,
      colorProgress: completed.has("color") ? 1 : phase == "color" ? progress : 0,
      texturedWords: completed.has("texture")
        ? wordCount
        : phase == "texture"
          ? Math.min(wordCount, Math.floor(activeTextureProgress) + 1)
          : 0,
      textureProgress: phase == "texture" ? activeTextureProgress % 1 : 1,
      arrangedLayers: completed.has("layers")
        ? layerCount
        : phase == "layers"
          ? Math.round(progress * layerCount)
          : 0,
      finalVisible: phase == "reveal",
    };
  }
}

globalThis.CreationRecipeRecorder = CreationRecipeRecorder;
globalThis.CreationDemoPlayer = CreationDemoPlayer;
globalThis.cleanCreationRecipe = cleanCreationRecipe;

scene.creation = {
  recorder: new CreationRecipeRecorder(),
  lastRecipe: null,
  demo: {
    player: new CreationDemoPlayer({
      onUpdate: (state) => {
        scene.creation.demo.presentation = state;
      },
      onComplete: () => {
        scene.creation.demo.complete = true;
      },
    }),
    presentation: null,
    complete: false,
  },
};

function captureCurrentCreationRecipe(options = {}) {
  let recipe = scene.creation.recorder.capture(options);
  if (recipe != null && scene.secretSession.recording) {
    recipe.id = recipe.id || `seed-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    recipe.special = {
      facePath: scene.secretSession.facePath,
      faceGender: scene.secretSession.faceGender,
    };
    saveSecretCreationRecipe(recipe);
    scene.secretSession.recording = false;
  }
  scene.creation.lastRecipe = recipe;
  return recipe;
}

async function saveSpecialSessionExample(posterSnapshot) {
  let posterBlob = cardPreviewPosterBlob(posterSnapshot);
  let response = await fetch(playSpaceApiUrl("/api/examples"), {
    method: "POST",
    headers: { "Content-Type": "image/png" },
    body: posterBlob,
  });
  if (!response.ok) {
    let message = "Unable to save example";
    try {
      message = (await response.json()).error || message;
    } catch (error) {
      // Keep the concise fallback when the server did not return JSON.
    }
    throw new Error(message);
  }
  let saved = await response.json();
  await refreshHomeExamples();
  console.info(`Saved PlaySpace example ${saved.filename}`);
  return saved;
}

function prepareCreationDemo(recipe, photo = null) {
  let cleaned = scene.creation.demo.player.load(recipe, photo);
  scene.creation.demo.presentation = scene.creation.demo.player.state;
  scene.creation.demo.complete = false;
  return cleaned;
}

function startCreationDemo() {
  scene.creation.demo.complete = false;
  return scene.creation.demo.player.start();
}

function updateCreationDemo(deltaMilliseconds) {
  return scene.creation.demo.player.update(deltaMilliseconds);
}

function drawCreationDemoContent(baseTextSize) {
  let presentation = updateCreationDemo(deltaTime);
  if (presentation == null) return;
  let order = syncLayerOrder();
  for (let layerIndex = 0; layerIndex < order.length; layerIndex++) {
    let item = layerItemForKey(order[layerIndex]);
    if (item == null) continue;
    if (item.type == "photo") {
      if (presentation.frameProgress > 0.01) drawSessionPhoto(layerIndex);
      continue;
    }
    if (item.wordIndex >= presentation.visibleWords) continue;
    let path = textPathForWordIndex(item.wordIndex);
    if (path == null) continue;
    drawWordOnTextPath(
      textWords()[item.wordIndex],
      path,
      textSizeForWordIndex(item.wordIndex, baseTextSize),
      item.wordIndex,
      layerIndex,
    );
  }
}

function stopCreationDemo() {
  scene.creation.demo.player.stop();
  scene.creation.demo.presentation = null;
  scene.creation.demo.complete = false;
}
