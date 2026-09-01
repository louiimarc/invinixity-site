const PLAYSPACE_SECRET_FACE_PATHS = [
  "assets/portraits/female/15-20-expanded.png",
  "assets/portraits/female/20-35-expanded.png",
  "assets/portraits/female/35-50-expanded.png",
  "assets/portraits/female/50-70-expanded.png",
  "assets/portraits/in_between/15-20-expanded.png",
  "assets/portraits/in_between/20-35-expanded.png",
  "assets/portraits/in_between/35-50-expanded.png",
  "assets/portraits/in_between/50-70-expanded.png",
  "assets/portraits/male/15-20-expanded.png",
  "assets/portraits/male/20-35-expanded.png",
  "assets/portraits/male/35-50-expanded.png",
  "assets/portraits/male/50-70-expanded.png",
];

const PLAYSPACE_SECRET_RECIPE_STORAGE_KEY = "playspace.secret-recipes.v1";
const PLAYSPACE_SECRET_RECIPE_LIMIT = 50;
const PLAYSPACE_GENDERED_NAME_VARIANTS = {
  female: {
    indra: "Indri",
    agung: "Ageng",
    yanto: "Yanti",
    irianto: "Irianti",
    harijanto: "Harijanti",
    purwanto: "Purwanti",
    setiawan: "Setiawati",
    kurniawan: "Kurniawati",
    gunawan: "Gunawati",
    irawan: "Irawati",
    hermawan: "Hermawati",
    wahyudi: "Wahyuni",
    putra: "Putri",
    saputra: "Saputri",
  },
  male: {
    indri: "Indra",
    ageng: "Agung",
    yanti: "Yanto",
    irianti: "Irianto",
    harijanti: "Harijanto",
    purwanti: "Purwanto",
    setiawati: "Setiawan",
    kurniawati: "Kurniawan",
    gunawati: "Gunawan",
    irawati: "Irawan",
    hermawati: "Hermawan",
    wahyuni: "Wahyudi",
    putri: "Putra",
    saputri: "Saputra",
  },
};

scene.secretSession = {
  enabled: false,
  recording: false,
  loading: false,
  requestId: 0,
  lastFacePath: null,
  facePath: null,
  faceGender: null,
  generatedName: "",
  faces: Object.create(null),
  names: {
    female: [],
    male: [],
    inBetween: [],
    last: [],
  },
  namePaths: {
    female: "assets/data/names/first_name_female.txt",
    male: "assets/data/names/first_name_male.txt",
    inBetween: "assets/data/names/first_name_androgyny.txt",
    last: "assets/data/names/last_name.txt",
  },
};

scene.secretDemo = {
  open: false,
  loading: false,
  requestId: 0,
  records: [],
  index: -1,
  activeRecipe: null,
};

function preloadSecretSessionNames() {
  for (let [key, path] of Object.entries(scene.secretSession.namePaths)) {
    loadStrings(
      path,
      (lines) => {
        scene.secretSession.names[key] = lines
          .map((line) => line.trim())
          .filter((line) => line != "");
        loaded();
      },
      (error) => {
        console.warn(`Unable to load ${key} secret-session names`, error);
        loaded();
      },
    );
  }
}

function preloadSecretSessionFaces() {
  let paths = PLAYSPACE_SECRET_FACE_PATHS.filter(
    (path) => scene.secretSession.faces[path] == null,
  );
  if (paths.length == 0) return;

  data.amount += paths.length;
  data.loading.status = true;
  let nextIndex = 0;
  let workerCount = min(3, paths.length);
  let runNext = () => {
    if (nextIndex >= paths.length) return;
    let path = paths[nextIndex++];
    loadImage(
      path,
      (photo) => {
        scene.secretSession.faces[path] = photo;
        loaded();
        runNext();
      },
      (error) => {
        console.warn(`Unable to preload PlaySpace seed face ${path}`, error);
        loaded();
        runNext();
      },
    );
  };
  for (let index = 0; index < workerCount; index++) runNext();
}

function secretSessionCanToggle() {
  return ["idle", "loading"].includes(scene.session.mode) &&
    !sessionCameraPromptOpen() &&
    !scene.ui?.printPreview?.open;
}

function toggleSecretSessionMode() {
  if (!secretSessionCanToggle()) return false;
  scene.secretSession.enabled = !scene.secretSession.enabled;
  console.info(
    `PlaySpace seed mode ${scene.secretSession.enabled ? "enabled" : "disabled"}`,
  );
  return true;
}

function randomSecretSessionFacePath() {
  let candidates = PLAYSPACE_SECRET_FACE_PATHS.filter(
    (path) => path != scene.secretSession.lastFacePath,
  );
  if (candidates.length == 0) candidates = PLAYSPACE_SECRET_FACE_PATHS;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function secretSessionFaceGender(facePath) {
  if (facePath.includes("/female/")) return "female";
  if (facePath.includes("/male/")) return "male";
  return "inBetween";
}

function genderedSecretSessionNamePart(name, gender) {
  let replacement = PLAYSPACE_GENDERED_NAME_VARIANTS[gender]?.[
    name.toLocaleLowerCase("id-ID")
  ];
  return replacement || name;
}

function randomSecretSessionName(facePath) {
  let gender = secretSessionFaceGender(facePath);
  let firstNames = scene.secretSession.names[gender];
  let lastNames = scene.secretSession.names.last;
  let firstName = firstNames.length > 0
    ? firstNames[Math.floor(Math.random() * firstNames.length)]
    : gender == "female"
      ? "Dewi"
      : gender == "male"
        ? "Budi"
        : "Dian";
  let lastName = lastNames.length > 0
    ? lastNames[Math.floor(Math.random() * lastNames.length)]
    : "Pratama";
  firstName = genderedSecretSessionNamePart(firstName, gender);
  lastName = genderedSecretSessionNamePart(lastName, gender);
  return `${firstName} ${lastName}`;
}

function applySecretSessionName(facePath) {
  let generatedName = randomSecretSessionName(facePath);
  scene.secretSession.facePath = facePath;
  scene.secretSession.faceGender = secretSessionFaceGender(facePath);
  scene.secretSession.generatedName = generatedName;
  scene.text.buffer = generatedName;
  scene.text.cursor.pos = generatedName.length;
  syncTextPathAssignments();
  scene.text.activeWord = firstWordWithoutPath();
  scene.text.pathEditArmed = scene.text.activeWord >= 0;
  syncInputFromText();
  saveTextMemory();
}

function storedSecretCreationRecipes() {
  try {
    let records = JSON.parse(
      localStorage.getItem(PLAYSPACE_SECRET_RECIPE_STORAGE_KEY) || "[]",
    );
    return Array.isArray(records) ? records : [];
  } catch (error) {
    console.warn("Unable to read secret creation recipes", error);
    return [];
  }
}

function saveSecretCreationRecipe(recipe) {
  if (recipe == null) return false;
  let records = storedSecretCreationRecipes();
  records.push(recipe);
  records.sort((first, second) => first.createdAt - second.createdAt);
  records = records.slice(-PLAYSPACE_SECRET_RECIPE_LIMIT);
  try {
    localStorage.setItem(
      PLAYSPACE_SECRET_RECIPE_STORAGE_KEY,
      JSON.stringify(records),
    );
    return true;
  } catch (error) {
    console.warn("Unable to save secret creation recipe JSON", error);
    return false;
  }
}

function secretCreationRecipesJson() {
  return JSON.stringify(storedSecretCreationRecipes(), null, 2);
}

function secretDemoNameLength(name) {
  return Array.from(name).length;
}

function randomSecretDemoNamePart(original, pool, gender, excluded = []) {
  let originalKey = original.toLocaleLowerCase("id-ID");
  let excludedKeys = new Set(
    excluded.map((name) => name.toLocaleLowerCase("id-ID")),
  );
  excludedKeys.add(originalKey);
  let targetLength = secretDemoNameLength(original);
  let candidates = [];
  let candidateKeys = new Set();

  for (let name of pool) {
    let candidate = genderedSecretSessionNamePart(name, gender);
    let candidateKey = candidate.toLocaleLowerCase("id-ID");
    let lengthDifference = Math.abs(
      secretDemoNameLength(candidate) - targetLength,
    );
    if (
      candidate == "" ||
      lengthDifference > 1 ||
      excludedKeys.has(candidateKey) ||
      candidateKeys.has(candidateKey)
    ) {
      continue;
    }
    candidateKeys.add(candidateKey);
    candidates.push(candidate);
  }

  if (candidates.length == 0) return original;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function randomizedSecretDemoRecipe(input) {
  let recipe = cleanCreationRecipe(input);
  if (recipe == null) return null;
  let gender = recipe.special?.faceGender || "inBetween";
  let originalParts = recipe.name.match(/\S+/g) || [];
  let replacementParts = [];

  for (let [index, original] of originalParts.entries()) {
    let pool = index == 0
      ? scene.secretSession.names[gender]
      : scene.secretSession.names.last;
    replacementParts.push(
      randomSecretDemoNamePart(original, pool, gender, replacementParts),
    );
  }

  let oldOccurrences = Object.create(null);
  let newOccurrences = Object.create(null);
  let replacementsByKey = new Map();
  for (let [index, original] of originalParts.entries()) {
    let replacement = replacementParts[index];
    oldOccurrences[original] = (oldOccurrences[original] || 0) + 1;
    newOccurrences[replacement] = (newOccurrences[replacement] || 0) + 1;
    let oldKey = creationRecipeWordKey(original, oldOccurrences[original]);
    replacementsByKey.set(oldKey, {
      key: creationRecipeWordKey(replacement, newOccurrences[replacement]),
      word: replacement,
      occurrence: newOccurrences[replacement],
    });
  }

  let words = recipe.words.map((word) => {
    let replacement = replacementsByKey.get(word.key);
    return replacement == null ? word : {
      ...word,
      ...replacement,
    };
  });
  let layerOrder = recipe.layerOrder.map((key) =>
    replacementsByKey.get(key)?.key || key
  );

  return {
    ...recipe,
    name: replacementParts.join(" "),
    namePattern: creationRecipeNamePattern(replacementParts.join(" ")),
    words,
    layerOrder,
  };
}

function denormalizeSecretDemoPoint(point, bounds) {
  return createVector(
    bounds.x + point.x * bounds.width,
    bounds.y + point.y * bounds.height,
  );
}

function applySecretDemoRecipe(recipe, photo) {
  let cleaned = cleanCreationRecipe(recipe);
  if (cleaned == null) return false;
  let bounds = compositionBounds();
  let frame = scene.session.photoFrame;

  clearTextMemory();
  resetSessionPhotoFrame();
  scene.session.photo = photo;
  frame.points = cleaned.frame.points.map((point) =>
    denormalizeSecretDemoPoint(point, bounds)
  );
  frame.closed = frame.points.length > 2;
  frame.layoutNormalized = true;
  frame.dirty = true;
  if (cleaned.frame.photoPlacement != null) {
    frame.photoPlacement = {
      x: bounds.x + cleaned.frame.photoPlacement.x * bounds.width,
      y: bounds.y + cleaned.frame.photoPlacement.y * bounds.height,
      width: cleaned.frame.photoPlacement.width * bounds.width,
      height: cleaned.frame.photoPlacement.height * bounds.height,
    };
  }

  scene.text.buffer = cleaned.name;
  scene.text.cursor.pos = cleaned.name.length;
  scene.text.paths = Object.create(null);
  scene.text.sizes = Object.create(null);
  scene.text.textureMixes = Object.create(null);
  scene.text.textureShuffleSeed = cleaned.textureShuffleSeed;
  scene.text.glyphAssets.assignmentCache = Object.create(null);
  for (let word of cleaned.words) {
    scene.text.paths[word.key] = word.path.map((point) =>
      denormalizeSecretDemoPoint(point, bounds)
    );
    scene.text.sizes[word.key] = word.size;
    scene.text.textureMixes[word.key] = { ...word.texture };
  }
  scene.text.layerOrder = [...cleaned.layerOrder];
  scene.text.edit = false;
  syncInputFromText();
  syncTextPathAssignments();
  setSessionBackgroundPalette(cleaned.background.paletteIndex, true);
  scene.session.mode = "secretDemo";
  data.loading.position.y = height;
  prepareCreationDemo(cleaned, photo);
  startCreationDemo();
  return true;
}

function loadSecretDemoIndex(index) {
  let viewer = scene.secretDemo;
  let count = viewer.records.length;
  if (count == 0) return false;
  viewer.index = ((index % count) + count) % count;
  let recipe = viewer.records[viewer.index];
  let facePath = recipe?.special?.facePath;
  if (typeof facePath != "string" || facePath == "") return false;
  let demoRecipe = randomizedSecretDemoRecipe(recipe);
  if (demoRecipe == null) return false;

  viewer.loading = true;
  viewer.activeRecipe = demoRecipe;
  scene.session.mode = "secretDemoLoading";
  stopCreationDemo();
  let requestId = ++viewer.requestId;
  let applyPhoto = (photo) => {
    if (requestId != viewer.requestId || !viewer.open) return;
    viewer.loading = false;
    if (!applySecretDemoRecipe(demoRecipe, photo)) closeSecretDemo();
  };
  let cachedPhoto = scene.secretSession.faces[facePath];
  if (cachedPhoto != null) {
    applyPhoto(cachedPhoto);
    return true;
  }
  loadImage(
    facePath,
    applyPhoto,
    (error) => {
      if (requestId != viewer.requestId) return;
      viewer.loading = false;
      console.warn("Unable to load saved demo portrait", facePath, error);
      closeSecretDemo();
    },
  );
  return true;
}

function openSecretDemo() {
  if (
    scene.session.mode != "idle" ||
    sessionCameraPromptOpen() ||
    scene.ui?.printPreview?.open
  ) {
    return false;
  }
  let viewer = scene.secretDemo;
  viewer.records = storedSecretCreationRecipes()
    .map((record) => cleanCreationRecipe(record))
    .filter((record) => record?.special?.facePath);
  if (viewer.records.length == 0) {
    console.info("No saved PlaySpace demos are available");
    return false;
  }
  viewer.open = true;
  data.loading.position.y = height;
  return loadSecretDemoIndex(viewer.records.length - 1);
}

function closeSecretDemo() {
  let viewer = scene.secretDemo;
  viewer.requestId++;
  viewer.open = false;
  viewer.loading = false;
  viewer.records = [];
  viewer.index = -1;
  viewer.activeRecipe = null;
  stopCreationDemo();
  scene.session.photo = null;
  resetSessionPhotoFrame();
  clearTextMemory();
  resetSessionBackgroundColor();
  scene.session.mode = "idle";
  data.loading.position.y = height;
}

function toggleSecretDemo() {
  if (scene.secretDemo.open) {
    closeSecretDemo();
    return true;
  }
  return openSecretDemo();
}

function seekSecretDemo(direction) {
  let viewer = scene.secretDemo;
  if (!viewer.open || viewer.records.length == 0) return false;
  return loadSecretDemoIndex(viewer.index + direction);
}

function drawSecretDemoStatus() {
  let viewer = scene.secretDemo;
  if (!viewer.open || viewer.records.length == 0) return;
  let recipe = viewer.activeRecipe || viewer.records[viewer.index];
  push();
  resetMatrix();
  ortho();
  resetShader();
  translate(0, 0, scene.layer.ui + 192);
  noStroke();
  fill(255);
  textFont(scene.font);
  textAlign(CENTER, TOP);
  textSize(18 * scene.ui.scale);
  text(
    `${viewer.index + 1} / ${viewer.records.length}  •  ${recipe.name}`,
    0,
    uiSafeTopY(20 * scene.ui.scale),
  );
  textAlign(CENTER, BOTTOM);
  textSize(14 * scene.ui.scale);
  text(
    "← Previous    Next →    ø Close",
    0,
    uiSafeBottomY(20 * scene.ui.scale),
  );
  pop();
}

function prepareSecretSessionState() {
  clearTextMemory();
  resetSessionPhotoFrame();
  resetSessionBackgroundColor(true);
  resetSessionFaceDetection();
  scene.session.photo = null;
  scene.session.mode = "secretFaceLoading";
  data.loading.position.y = height;
  scene.ui.pointer.pressTarget = null;
  scene.ui.pointer.pressStartedOnButton = false;
}

function beginSecretSession() {
  if (
    !scene.secretSession.enabled ||
    scene.secretSession.loading ||
    scene.session.mode != "idle" ||
    !data.loading.ready
  ) {
    return false;
  }

  prepareSecretSessionState();
  scene.secretSession.loading = true;
  scene.secretSession.recording = true;
  let requestId = ++scene.secretSession.requestId;
  let facePath = randomSecretSessionFacePath();
  applySecretSessionName(facePath);

  let applyPhoto = (photo) => {
    if (requestId != scene.secretSession.requestId) return;
    scene.secretSession.loading = false;
    scene.secretSession.lastFacePath = facePath;
    scene.session.photo = photo;
    scene.session.mode = "frame";
    startSessionPhotoFrameStage();
    scheduleSessionCacheSave(true);
    detectSessionPhotoFaces(photo);
  };
  let cachedPhoto = scene.secretSession.faces[facePath];
  if (cachedPhoto != null) {
    applyPhoto(cachedPhoto);
    return true;
  }
  loadImage(
    facePath,
    applyPhoto,
    (error) => {
      if (requestId != scene.secretSession.requestId) return;
      scene.secretSession.loading = false;
      scene.secretSession.recording = false;
      scene.secretSession.facePath = null;
      scene.secretSession.faceGender = null;
      scene.secretSession.generatedName = "";
      scene.session.photo = null;
      scene.session.mode = "idle";
      data.loading.position.y = height;
      clearTextMemory();
      console.warn("Unable to load PlaySpace seed face", facePath, error);
    },
  );
  return true;
}

function cancelSecretSessionLoad() {
  if (!scene.secretSession.loading) return;
  scene.secretSession.requestId++;
  scene.secretSession.loading = false;
  scene.secretSession.recording = false;
}
