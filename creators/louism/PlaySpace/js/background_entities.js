function backgroundEntityTexturePaths() {
  let palettes = [
    "blue_purple",
    "greyscale",
    "neon_green_yellow",
    "pastel",
  ];
  let paths = [];
  for (let palette of palettes) {
    for (let variant = 1; variant <= 2; variant++) {
      paths.push({
        palette,
        variant: variant - 1,
        path:
          `assets/texture/entity_experiments/${palette}/` +
          `example_${String(variant).padStart(2, "0")}.png`,
      });
    }
  }
  return paths;
}

function preloadBackgroundEntityTextures() {
  scene.backgroundEntityAssets.textures =
    backgroundEntityTexturePaths().map((entry) => {
      return {
        ...entry,
        image: loadImage(
          entry.path,
          loaded,
          (error) => {
            console.warn(`Unable to load background entity ${entry.path}`, error);
            loaded();
          },
        ),
        keyColor: [0.93, 0.92, 0.96],
      };
    });
}

function backgroundEntityCornerColor(image) {
  if (image == null || image.width <= 0 || image.height <= 0) {
    return [0.93, 0.92, 0.96];
  }

  let corners = [
    image.get(0, 0),
    image.get(image.width - 1, 0),
    image.get(0, image.height - 1),
    image.get(image.width - 1, image.height - 1),
  ];
  return [0, 1, 2].map((channel) => {
    return (
      corners.reduce((sum, color) => sum + color[channel], 0) /
      corners.length /
      255
    );
  });
}

function setupBackgroundEntities() {
  let assets = scene.backgroundEntityAssets;
  for (let texture of assets.textures) {
    texture.keyColor = backgroundEntityCornerColor(texture.image);
    texture.image.resize(assets.textureSize, assets.textureSize);
  }
  if (scene.session.backgroundEntities.placements.length == 0) {
    resetSessionBackgroundEntities();
  }
}

function backgroundEntityRandom(seed, offset) {
  let value = Math.sin(seed * 0.0000137 + offset * 91.731) * 43758.5453;
  return value - Math.floor(value);
}

function createBackgroundEntityPlacements(seed) {
  let placements = [];
  let perimeterOffset = backgroundEntityRandom(seed, 2);
  for (let index = 0; index < 3; index++) {
    let isCounterweight = index == 2;
    placements.push({
      perimeter: (perimeterOffset + index / 3) % 1,
      inset: isCounterweight
        ? lerp(0.14, 0.25, backgroundEntityRandom(seed, 20 + index))
        : lerp(0.05, 0.18, backgroundEntityRandom(seed, 20 + index)),
      size: isCounterweight
        ? lerp(0.3, 0.44, backgroundEntityRandom(seed, 30 + index))
        : lerp(0.66, 0.92, backgroundEntityRandom(seed, 30 + index)),
      rotation: lerp(-35, 35, backgroundEntityRandom(seed, 40 + index)),
      variant: floor(backgroundEntityRandom(seed, 50 + index) * 2),
    });
  }
  return placements;
}

function resetSessionBackgroundEntities() {
  let state = scene.session.backgroundEntities;
  state.seed = floor(random(1, 2147483646));
  state.placements = createBackgroundEntityPlacements(state.seed);
  scene.backgroundEntityAssets.animatedPlacements = [];
}

function cleanStoredBackgroundEntityPlacement(placement, index) {
  if (placement == null || typeof placement != "object") return null;
  let isCounterweight = index == 2;
  return {
    perimeter: Number.isFinite(placement.perimeter)
      ? ((placement.perimeter % 1) + 1) % 1
      : index / 3,
    inset: constrain(
      Number(placement.inset) || (isCounterweight ? 0.2 : 0.12),
      isCounterweight ? 0.14 : 0.05,
      isCounterweight ? 0.25 : 0.18,
    ),
    size: constrain(
      Number(placement.size) || (isCounterweight ? 0.36 : 0.78),
      isCounterweight ? 0.3 : 0.66,
      isCounterweight ? 0.44 : 0.92,
    ),
    rotation: constrain(Number(placement.rotation) || 0, -35, 35),
    variant: constrain(floor(placement.variant) || 0, 0, 1),
  };
}

function loadStoredBackgroundEntities(stored) {
  if (stored == null || typeof stored != "object") return false;
  let seed = Number.isFinite(stored.seed)
    ? stored.seed
    : 1;
  let placements = createBackgroundEntityPlacements(seed);
  if (Array.isArray(stored.placements)) {
    for (let index = 0; index < 3; index++) {
      let cleaned = cleanStoredBackgroundEntityPlacement(
        stored.placements[index],
        index,
      );
      if (cleaned != null) {
        cleaned.perimeter = placements[index].perimeter;
        placements[index] = cleaned;
      }
    }
  }
  scene.session.backgroundEntities.seed = seed;
  scene.session.backgroundEntities.placements = placements;
  scene.backgroundEntityAssets.animatedPlacements = [];
  return true;
}

function backgroundEntityHueDistance(a, b) {
  let difference = abs(a - b) % 1;
  return min(difference, 1 - difference);
}

function backgroundEntityPaletteOrder() {
  let color = scene.session.backgroundColor;
  if (color.saturation < 0.12) {
    return color.brightness < 0.45
      ? ["greyscale", "pastel", "neon_green_yellow", "blue_purple"]
      : ["greyscale", "blue_purple", "pastel", "neon_green_yellow"];
  }

  let descriptors = [
    { palette: "blue_purple", hue: 0.72 },
    { palette: "neon_green_yellow", hue: 0.2 },
    { palette: "pastel", hue: 0.96 },
  ];
  let complement = (color.hue + 0.5) % 1;
  let ranked = descriptors
    .map((descriptor) => {
      let analogous = backgroundEntityHueDistance(descriptor.hue, color.hue);
      let opposite = backgroundEntityHueDistance(descriptor.hue, complement);
      let harmony = min(analogous * 0.92, opposite);
      if (color.brightness < 0.34 && descriptor.palette == "neon_green_yellow") {
        harmony -= 0.08;
      }
      return { ...descriptor, harmony };
    })
    .sort((a, b) => a.harmony - b.harmony)
    .map((descriptor) => descriptor.palette);

  ranked.push("greyscale");
  return ranked;
}

function backgroundEntityTextureForSlot(slot, placement) {
  let palette = backgroundEntityPaletteOrder()[slot] || "greyscale";
  return scene.backgroundEntityAssets.textures.find((texture) => {
    return texture.palette == palette && texture.variant == placement.variant;
  });
}

function backgroundEntityColorTarget(placement, slot, viewWidth, viewHeight) {
  let color = scene.session.backgroundColor;
  let seed = scene.session.backgroundEntities.seed;
  let colorPhase = color.hue * TWO_PI +
    color.saturation * 1.73 + color.brightness * 0.91;
  let slotPhase = backgroundEntityRandom(seed, 70 + slot) * TWO_PI;
  let isCounterweight = slot == 2;
  let angle = (placement.perimeter + color.hue) * TWO_PI - HALF_PI;
  let inset = constrain(
    placement.inset,
    isCounterweight ? 0.12 : 0.03,
    isCounterweight ? 0.28 : 0.21,
  );
  let scaleVariance = 1 +
    Math.sin(colorPhase * 1.17 + slotPhase + 2.2) * 0.055;
  let size = min(viewWidth, viewHeight) * placement.size * scaleVariance;
  let x = viewWidth / 2 +
    Math.cos(angle) * viewWidth / 2 * (1 - inset);
  let y = viewHeight / 2 +
    Math.sin(angle) * viewHeight / 2 * (1 - inset);
  let displacementScale = min(viewWidth, viewHeight) * 0.2;
  let saturationOffset = (color.saturation - 0.5) * displacementScale;
  let brightnessOffset = (color.brightness - 0.5) * displacementScale;
  x += Math.cos(slotPhase) * saturationOffset +
    Math.cos(slotPhase + HALF_PI) * brightnessOffset;
  y += Math.sin(slotPhase) * saturationOffset +
    Math.sin(slotPhase + HALF_PI) * brightnessOffset;
  return {
    x,
    y,
    size,
    rotation: placement.rotation +
      Math.sin(colorPhase + slotPhase + 0.8) * 9,
  };
}

function backgroundEntityAnimatedTarget(target, placement, slot) {
  let desired = backgroundEntityColorTarget(
    placement,
    slot,
    target.width,
    target.height,
  );
  let animated = scene.backgroundEntityAssets.animatedPlacements;
  if (animated[slot] == null) {
    animated[slot] = { ...desired };
    return animated[slot];
  }
  let ease = 0.075;
  animated[slot].x = lerp(animated[slot].x, desired.x, ease);
  animated[slot].y = lerp(animated[slot].y, desired.y, ease);
  animated[slot].size = lerp(animated[slot].size, desired.size, ease);
  animated[slot].rotation = lerp(
    animated[slot].rotation,
    desired.rotation,
    ease,
  );
  return animated[slot];
}

function drawBackgroundEntities(target) {
  if (
    scene.session.mode != "active" ||
    target == null ||
    scene.backgroundEntityShader == null
  ) {
    return;
  }

  let placements = scene.session.backgroundEntities.placements;
  if (placements.length == 0) return;
  let gl = target._renderer.GL;
  target.push();
  target.resetMatrix();
  target.ortho();
  gl.clear(gl.DEPTH_BUFFER_BIT);
  target.blendMode(BLEND);
  target.noStroke();
  target.fill(255, 1);
  target.rectMode(CENTER);
  target.shader(scene.backgroundEntityShader);
  scene.backgroundEntityShader.setUniform(
    "u_background_color",
    sessionBackgroundRgb(),
  );
  gl.enable(gl.BLEND);
  gl.blendEquation(gl.FUNC_ADD);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);

  for (let slot = 0; slot < placements.length; slot++) {
    let placement = placements[slot];
    let texture = backgroundEntityTextureForSlot(slot, placement);
    if (texture == null) continue;
    let bounds = backgroundEntityAnimatedTarget(target, placement, slot);
    scene.backgroundEntityShader.setUniform("u_texture", texture.image);
    scene.backgroundEntityShader.setUniform("u_key_color", texture.keyColor);
    scene.backgroundEntityShader.setUniform("u_opacity", 0.86);
    target.push();
    target.translate(
      bounds.x - target.width / 2,
      bounds.y - target.height / 2,
      scene.layer.background + 1,
    );
    target.rotate(bounds.rotation);
    target.rect(0, 0, bounds.size, bounds.size);
    target.pop();
  }

  gl.depthMask(true);
  target.resetShader();
  target.pop();
}
