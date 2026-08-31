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
      "M_5", "N_1", "N_2", "N_3", "N_7", "R_6", "R_7", "U_2",
      "U_4", "U_8", "Z_1", "Z_8", "Z_9",
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

function textGlyphGroupWeights(mix) {
  let x = constrain(mix?.x ?? 0.5, 0, 1);
  let y = constrain(mix?.y ?? 0.5, 0, 1);
  return [
    { group: "Airbrush", weight: (1 - x) * (1 - y) },
    { group: "Pastel", weight: x * (1 - y) },
    { group: "Collage", weight: (1 - x) * y },
    { group: "Marker", weight: x * y },
  ];
}

function textGlyphRandom(seed, offset) {
  let value = Math.sin(seed * 0.0173 + offset * 83.127) * 43758.5453;
  return value - Math.floor(value);
}

function textGlyphGroupsForWord(wordSeed, characterCount, mix) {
  let cache = scene.text.glyphAssets.assignmentCache;
  let cacheKey = [
    characterCount,
    (mix?.x ?? 0.5).toFixed(4),
    (mix?.y ?? 0.5).toFixed(4),
  ].join(":");
  if (cache[wordSeed]?.key == cacheKey) return cache[wordSeed].groups;

  let options = textGlyphGroupWeights(mix).map((option, index) => {
    let exactCount = option.weight * characterCount;
    return {
      ...option,
      index,
      count: floor(exactCount),
      remainder: exactCount - floor(exactCount),
      tieBreaker: textGlyphRandom(wordSeed, index + 11),
    };
  });
  let assigned = options.reduce((sum, option) => sum + option.count, 0);
  let remaining = characterCount - assigned;
  let remainderOrder = [...options].sort((a, b) => {
    if (abs(a.remainder - b.remainder) > 0.000001) {
      return b.remainder - a.remainder;
    }
    return b.tieBreaker - a.tieBreaker;
  });

  for (let i = 0; i < remaining; i++) {
    remainderOrder[i % remainderOrder.length].count++;
  }

  let groups = [];
  for (let option of options) {
    for (let i = 0; i < option.count; i++) groups.push(option.group);
  }
  for (let i = groups.length - 1; i > 0; i--) {
    let randomIndex = floor(textGlyphRandom(wordSeed, i + 101) * (i + 1));
    [groups[i], groups[randomIndex]] = [groups[randomIndex], groups[i]];
  }
  cache[wordSeed] = { key: cacheKey, groups };
  return groups;
}

function textGlyphEntryFor(char, seed, group) {
  let character = char.toUpperCase();
  let assets = scene.text.glyphAssets;
  let candidates = assets.byGroup[group]?.[character];

  if (candidates == null || candidates.length == 0) {
    candidates = assets.byCharacter[character];
  }
  if (candidates == null || candidates.length == 0) return null;

  let index = floor(textGlyphRandom(seed, 2) * candidates.length);
  return candidates[min(index, candidates.length - 1)];
}

function drawTextGlyphImage(
  gfx,
  char,
  size,
  seed,
  group,
) {
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
