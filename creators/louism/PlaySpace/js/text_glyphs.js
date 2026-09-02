function textGlyphAssetEntries() {
  let sources = {
    Marker: [
      "A_1", "A_9", "B_2", "B_3", "C_2", "C_3", "D_2", "D_3",
      "E_9", "E_10", "E_15", "E_16", "F_2", "F_3", "G_2", "G_3",
      "H_5", "H_8", "I_5", "I_8", "J_2", "J_3", "K_2", "K_3",
      "L_1", "L_2", "M_4", "M_6", "N_6", "N_8", "O_2", "O_3",
      "O_4", "P_1", "P_2", "Q_1", "Q_2", "R_1", "R_8", "S_1",
      "S_2", "U_1", "U_3", "V_2", "V_3", "W_2", "W_3", "X_2",
      "Y_1", "Z_7", "Z_10",
    ],
    Pastel: [
      "1_1", "A_4", "A_5", "A_6", "E_4", "E_5", "E_6", "E_7",
      "E_8", "H_1", "H_2", "H_3", "H_4", "I_1", "I_2", "I_3",
      "I_4", "M_2", "M_3", "N_4", "N_5", "R_2", "R_3", "R_4",
      "R_5", "T_1", "T_2", "U_5", "U_6", "U_7", "Z_2", "Z_3",
      "Z_4", "Z_5", "Z_6",
    ],
    Collage: [
      "A_3", "A_7", "A_8", "E_1", "E_2", "E_3", "E_11", "E_12",
      "E_13", "E_14", "H_6", "H_7", "I_6", "I_7", "K_1", "M_1",
      "M_5", "N_1", "N_2", "N_3", "N_7", "P_3", "Q_3", "R_6",
      "R_7", "S_3", "U_2", "U_4", "U_8", "Z_1", "Z_8", "Z_9",
    ],
    Airbrush: [
      "2_1", "3_1", "A_2", "B_1", "C_1", "D_1", "F_1", "G_1",
      "J_1", "O_1", "V_1", "W_1", "X_1",
    ],
  };
  let entries = [];

  for (let [group, names] of Object.entries(sources)) {
    for (let name of names) {
      entries.push({
        group,
        character: name.split("_")[0],
        path: `assets/poster/glyphs/png/${name}.png`,
      });
    }
  }
  return entries;
}

function setupTextGlyphAssets() {
  let assets = scene.text.glyphAssets;
  assets.entries = textGlyphAssetEntries().map((entry) => ({
    ...entry,
    image: null,
    loading: false,
    failed: false,
  }));
  assets.byGroup = Object.create(null);
  assets.byCharacter = Object.create(null);

  for (let entry of assets.entries) {
    if (assets.byGroup[entry.group] == null) {
      assets.byGroup[entry.group] = Object.create(null);
    }
    if (assets.byGroup[entry.group][entry.character] == null) {
      assets.byGroup[entry.group][entry.character] = [];
    }
    assets.byGroup[entry.group][entry.character].push(entry);
    if (assets.byCharacter[entry.character] == null) {
      assets.byCharacter[entry.character] = [];
    }
    assets.byCharacter[entry.character].push(entry);
  }
}

function requestTextGlyphImage(entry, onSettled = null) {
  if (entry == null || entry.image != null || entry.loading || entry.failed) {
    if (typeof onSettled == "function") onSettled();
    return;
  }

  entry.loading = true;
  loadImage(
    entry.path,
    (imageAsset) => {
      if (imageAsset.height > scene.text.glyphAssets.renderHeight) {
        imageAsset.resize(0, scene.text.glyphAssets.renderHeight);
      }
      entry.image = imageAsset;
      entry.loading = false;
      if (typeof onSettled == "function") onSettled();
    },
    (error) => {
      entry.loading = false;
      entry.failed = true;
      console.warn(`Unable to load text glyph ${entry.path}`, error);
      if (typeof onSettled == "function") onSettled();
    },
  );
}

function preloadAllTextGlyphImages() {
  let entries = scene.text.glyphAssets.entries.filter(
    (entry) => entry.image == null && !entry.loading && !entry.failed,
  );
  if (entries.length == 0) return;

  data.amount += entries.length;
  data.loading.status = true;
  let nextIndex = 0;
  let workerCount = min(3, entries.length);
  let runNext = () => {
    if (nextIndex >= entries.length) return;
    let entry = entries[nextIndex++];
    requestTextGlyphImage(entry, () => {
      loaded();
      runNext();
    });
  };
  for (let index = 0; index < workerCount; index++) runNext();
}

function textGlyphRandom(seed, offset) {
  let value = Math.sin(seed * 0.0173 + offset * 83.127) * 43758.5453;
  return value - Math.floor(value);
}

function nextTextTextureShuffleSeed() {
  if (globalThis.crypto?.getRandomValues != null) {
    let values = new Uint32Array(1);
    globalThis.crypto.getRandomValues(values);
    return values[0] & 0x7fffffff;
  }
  return Math.floor(
    (Date.now() + Math.random() * 0x7fffffff) % 0x7fffffff,
  );
}

function balancedTextGlyphGroups() {
  let cache = scene.text.glyphAssets.assignmentCache;
  let words = textWords();
  let shuffleSeed = scene.text.textureShuffleSeed || 1;
  let cacheKey = `${shuffleSeed}:${words.join("\u0000")}`;
  if (cache.balancedName?.key == cacheKey) {
    return cache.balancedName.groupsByWord;
  }

  let groupNames = ["Airbrush", "Pastel", "Collage", "Marker"];
  let groupsByWord = words.map((word) => Array(word.length).fill("Marker"));
  let positions = [];
  for (let wordIndex = 0; wordIndex < words.length; wordIndex++) {
    for (
      let characterIndex = 0;
      characterIndex < words[wordIndex].length;
      characterIndex++
    ) {
      positions.push({
        wordIndex,
        characterIndex,
        character: words[wordIndex][characterIndex].toUpperCase(),
      });
    }
  }
  for (let index = positions.length - 1; index > 0; index--) {
    let randomIndex = floor(
      textGlyphRandom(shuffleSeed, index + 101) * (index + 1),
    );
    [positions[index], positions[randomIndex]] = [
      positions[randomIndex],
      positions[index],
    ];
  }

  let counts = Object.fromEntries(groupNames.map((group) => [group, 0]));
  for (let [positionIndex, position] of positions.entries()) {
    let availableGroups = groupNames.filter((group) =>
      (scene.text.glyphAssets.byGroup[group]?.[position.character]?.length || 0) > 0
    );
    if (availableGroups.length == 0) availableGroups = [...groupNames];
    let minimumCount = min(...availableGroups.map((group) => counts[group]));
    let leastUsedGroups = availableGroups.filter(
      (group) => counts[group] == minimumCount,
    );
    let groupIndex = floor(
      textGlyphRandom(shuffleSeed, positionIndex + 401) * leastUsedGroups.length,
    );
    let group = leastUsedGroups[min(groupIndex, leastUsedGroups.length - 1)];
    groupsByWord[position.wordIndex][position.characterIndex] = group;
    counts[group]++;
  }

  cache.balancedName = { key: cacheKey, groupsByWord };
  return groupsByWord;
}

function textGlyphGroupsForWord(wordSeed, characterCount, mix) {
  let groups = balancedTextGlyphGroups()[wordSeed - 1] || [];
  return Array.from(
    { length: characterCount },
    (_, index) => groups[index] || "Marker",
  );
}

function textGlyphEntryFor(char, seed, group) {
  let character = char.toUpperCase();
  let assets = scene.text.glyphAssets;
  let candidates = assets.byGroup[group]?.[character];

  if (candidates == null || candidates.length == 0) {
    candidates = assets.byCharacter[character];
  }
  if (candidates == null || candidates.length == 0) return null;

  let shuffleSeed = scene.text.textureShuffleSeed || 1;
  let variantSeed = seed + (shuffleSeed % 1000000) * 4099;
  let index = floor(textGlyphRandom(variantSeed, 2) * candidates.length);
  return candidates[min(index, candidates.length - 1)];
}

function drawTextGlyphImage(gfx, char, size, seed, group) {
  if (char.trim() == "") return;
  let entry = textGlyphEntryFor(char, seed, group);

  if (entry == null || entry.image == null) {
    requestTextGlyphImage(entry);
    fillWorkspaceText(gfx, defaultTextColor());
    gfx.noStroke();
    gfx.textFont(scene.text.font);
    gfx.textSize(size);
    gfx.text(char, 0, 0);
    return;
  }

  let imageAsset = entry.image;
  let drawHeight = size;
  let drawWidth = drawHeight * imageAsset.width / imageAsset.height;
  gfx.imageMode(CENTER);
  gfx.tint(255, 255, 255, 255);
  gfx.image(imageAsset, 0, 0, drawWidth, drawHeight);
}

function prefetchTextGlyphsForCurrentWords() {
  let words = textWords();
  for (let wordIndex = 0; wordIndex < words.length; wordIndex++) {
    let word = words[wordIndex];
    let groups = textGlyphGroupsForWord(
      wordIndex + 1,
      word.length,
      textureMixForWordIndex(wordIndex),
    );
    for (let characterIndex = 0; characterIndex < word.length; characterIndex++) {
      requestTextGlyphImage(textGlyphEntryFor(
        word[characterIndex],
        wordIndex * 1000 + characterIndex + 1,
        groups[characterIndex],
      ));
    }
  }
}

function applyTextTextureShuffleSeed(seed) {
  scene.text.textureShuffleSeed = max(1, seed & 0x7fffffff);
  scene.text.glyphAssets.assignmentCache = Object.create(null);
  prefetchTextGlyphsForCurrentWords();
}

function rehumanizeSpinSeed(finalSeed, step) {
  let mixed = (
    finalSeed ^ Math.imul(step + 1, 0x45d9f3b)
  ) >>> 0;
  return max(1, mixed & 0x7fffffff);
}

function updateRehumanizeTextureSpin() {
  let state = scene.ui.texturePad;
  if (!state.spinning) return 1;

  let elapsed = max(0, scene.elapsedTime - state.spinStartedAt);
  let progress = constrain(elapsed / state.spinDuration, 0, 1);
  let stepTimes = [
    0, 0.06, 0.13, 0.21, 0.30, 0.40, 0.51, 0.63, 0.76, 0.89,
  ];
  let targetStep = 0;
  for (let index = 1; index < state.spinStepCount; index++) {
    if (progress < stepTimes[index]) break;
    targetStep = index;
  }
  if (targetStep > state.spinStep) {
    state.spinStep = targetStep;
    applyTextTextureShuffleSeed(
      rehumanizeSpinSeed(state.finalSeed, targetStep),
    );
    inout.audio.ui?.slide(
      "rehumanizeSpin",
      targetStep / max(1, state.spinStepCount - 1),
      mouseX / width,
    );
  }

  if (progress >= 1) {
    applyTextTextureShuffleSeed(state.finalSeed);
    state.spinning = false;
    state.spinStep = -1;
    saveTextMemory();
    scheduleSessionCacheSave();
    recordEditorHistory();
    return 1;
  }
  return progress;
}

function rehumanizeNameTextures() {
  if (textWords().length == 0 || scene.ui.texturePad.spinning) return false;
  let state = scene.ui.texturePad;
  state.spinning = true;
  state.spinStartedAt = scene.elapsedTime;
  state.spinStep = -1;
  state.finalSeed = nextTextTextureShuffleSeed();
  updateRehumanizeTextureSpin();
  return true;
}
