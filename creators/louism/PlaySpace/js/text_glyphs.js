function textGlyphAssetEntries() {
  let sources = {
    InkSpray: [
      "A", "E_01", "E_02", "H", "I", "M", "N", "R", "U", "Z",
    ],
    Pastel: [
      "A_01", "A_02", "E_01", "E_02", "E_03", "E_04", "H",
      "I_01", "I_02", "I_03", "J_02", "M_01", "N_01", "N_02",
      "N_03", "R_01", "R_02", "U_01", "U_02", "Z_01", "Z_02",
      "Z_03",
    ],
    MixedMedia: [
      "A_01", "A_02", "E_01", "E_02", "E_03", "H_01", "H_02", "I",
      "M", "N_01", "N_02", "R_01", "R_02", "U_01", "U_02", "U_03",
      "Z_01", "Z_02",
    ],
    SprayPaint: [
      "3", "A", "B", "C", "D", "F", "G", "I", "O", "V", "W", "X",
      "Z",
    ],
    Marker: ["K"],
    Humanize: ["L", "P", "Q", "S", "T", "Y"],
  };
  let entries = [];

  for (let [group, names] of Object.entries(sources)) {
    for (let name of names) {
      entries.push({
        group,
        character: name[0],
        path: `assets/alphabet/vectorized/${group}_${name}.png`,
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

function requestTextGlyphImage(entry) {
  if (entry == null || entry.image != null || entry.loading || entry.failed) {
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
    },
    (error) => {
      entry.loading = false;
      entry.failed = true;
      console.warn(`Unable to load text glyph ${entry.path}`, error);
    },
  );
}

function textGlyphGroupWeights(mix) {
  let x = constrain(mix?.x ?? 0.5, 0, 1);
  let y = constrain(mix?.y ?? 0.5, 0, 1);
  return [
    { group: "InkSpray", weight: (1 - x) * (1 - y) },
    { group: "Pastel", weight: x * (1 - y) },
    { group: "MixedMedia", weight: (1 - x) * y },
    { group: "SprayPaint", weight: x * y },
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
