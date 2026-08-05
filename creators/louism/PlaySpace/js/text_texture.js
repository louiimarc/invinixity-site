function textTextureCornerPaths() {
  let corners = [
    {
      corner: "topLeft",
      folder: "blue_purple",
    },
    {
      corner: "topRight",
      folder: "pastel",
    },
    {
      corner: "bottomLeft",
      folder: "neon_green_yellow",
    },
    {
      corner: "bottomRight",
      folder: "greyscale",
    },
  ];
  let paths = [];
  for (let corner of corners) {
    for (let variant = 0; variant < 4; variant++) {
      paths.push({
        corner: corner.corner,
        variant,
        path:
          `assets/texture/text_textures/${corner.folder}/` +
          `entity_${String(variant + 1).padStart(2, "0")}.png`,
      });
    }
  }
  return paths;
}

function preloadTextTextureAssets() {
  scene.text.textureAssets.images = textTextureCornerPaths().map((entry) => {
    return {
      ...entry,
      image: loadImage(
        entry.path,
        loaded,
        (error) => {
          console.warn(`Unable to load text texture ${entry.path}`, error);
          loaded();
        },
      ),
    };
  });
}

function setupTextTextureAssets() {
  let assets = scene.text.textureAssets;
  for (let texture of assets.images) {
    if (texture.image.width > assets.textureSize) {
      texture.image.resize(assets.textureSize, assets.textureSize);
    }
  }
}

function textTextureWeights(mix) {
  let x = constrain(mix?.x ?? 0.5, 0, 1);
  let y = constrain(mix?.y ?? 0.5, 0, 1);
  return {
    topLeft: (1 - x) * (1 - y),
    topRight: x * (1 - y),
    bottomLeft: (1 - x) * y,
    bottomRight: x * y,
  };
}

function textTextureRandom(seed, offset) {
  let value = Math.sin(seed * 0.0173 + offset * 83.127) * 43758.5453;
  return value - Math.floor(value);
}

function textTextureBuffer(maskBuffer, seed, mix) {
  let assets = scene.text.textureAssets;
  if (
    assets.images.length != textTextureCornerPaths().length ||
    assets.images.some((texture) => texture.image.width <= 1)
  ) {
    return null;
  }

  let bufferSize = maskBuffer.width;
  let buffer = assets.buffers[seed];
  if (buffer == null) {
    buffer = createGraphics(bufferSize, bufferSize);
    buffer.pixelDensity(1);
    assets.buffers[seed] = buffer;
  } else if (buffer.width != bufferSize || buffer.height != bufferSize) {
    buffer.resizeCanvas(bufferSize, bufferSize);
  }

  let mixedBuffer = textTextureMixedBuffer(bufferSize, seed, mix);
  buffer.clear();
  buffer.imageMode(CORNER);
  buffer.image(mixedBuffer, 0, 0, bufferSize, bufferSize);
  let context = buffer.drawingContext;
  context.save();
  context.globalAlpha = 1;
  context.globalCompositeOperation = "destination-in";
  buffer.image(maskBuffer, 0, 0, bufferSize, bufferSize);
  context.globalCompositeOperation = "source-atop";
  let gloss = context.createLinearGradient(0, 0, bufferSize, bufferSize);
  gloss.addColorStop(0, "rgba(255, 255, 255, 0)");
  gloss.addColorStop(0.26, "rgba(255, 255, 255, 0.08)");
  gloss.addColorStop(0.43, "rgba(255, 255, 255, 0.34)");
  gloss.addColorStop(0.62, "rgba(255, 255, 255, 0.06)");
  gloss.addColorStop(1, "rgba(255, 255, 255, 0)");
  context.fillStyle = gloss;
  context.fillRect(0, 0, bufferSize, bufferSize);
  context.restore();
  return buffer;
}

function textTextureMixedBuffer(bufferSize, seed, mix) {
  let assets = scene.text.textureAssets;
  let weights = textTextureWeights(mix);
  let variant = floor(textTextureRandom(seed, 0) * 4);
  let mixKey = [
    bufferSize,
    variant,
    constrain(mix?.x ?? 0.5, 0, 1).toFixed(3),
    constrain(mix?.y ?? 0.5, 0, 1).toFixed(3),
  ].join(":");
  let buffer = assets.mixBuffers[seed];
  if (buffer == null) {
    buffer = createGraphics(bufferSize, bufferSize);
    buffer.pixelDensity(1);
    assets.mixBuffers[seed] = buffer;
  } else if (buffer.width != bufferSize || buffer.height != bufferSize) {
    buffer.resizeCanvas(bufferSize, bufferSize);
  }
  if (assets.mixKeys[seed] == mixKey) return buffer;

  let drawSize = bufferSize * 2.15;
  let cropRange = drawSize - bufferSize;
  let cropX = -cropRange * lerp(0.18, 0.82, textTextureRandom(seed, 1));
  let cropY = -cropRange * lerp(0.18, 0.82, textTextureRandom(seed, 2));
  let context = buffer.drawingContext;

  buffer.clear();
  buffer.push();
  buffer.imageMode(CORNER);
  buffer.noTint();
  context.save();
  context.globalCompositeOperation = "lighter";
  for (let texture of assets.images) {
    if (texture.variant != variant) continue;
    let weight = weights[texture.corner];
    if (weight <= 0.0001) continue;
    context.globalAlpha = weight;
    buffer.image(texture.image, cropX, cropY, drawSize, drawSize);
  }
  context.restore();
  buffer.pop();
  assets.mixKeys[seed] = mixKey;
  return buffer;
}

function tornTextBorderBuffer(glyph, size, seed, wiggle = true) {
  let assets = scene.text.textureAssets;
  let bufferSize = max(1, ceil(size * 1.25));
  let buffer = assets.borderBuffers[seed];
  if (buffer == null) {
    buffer = createGraphics(bufferSize, bufferSize);
    buffer.pixelDensity(1);
    assets.borderBuffers[seed] = buffer;
  } else if (buffer.width != bufferSize || buffer.height != bufferSize) {
    buffer.resizeCanvas(bufferSize, bufferSize);
  }

  let scaleValue = size / scene.text.svg.viewBoxSize;
  let amount = wiggle
    ? scene.text.svg.edgeAmount / scaleValue * 1.35
    : 0;
  let backingSeed = seed + 104729;
  let contours = glyph.contours.map((contour, index) =>
    wiggledSvgContour(contour, backingSeed, index, amount),
  );
  let expansion = lerp(1.07, 1.095, textTextureRandom(seed, 10));

  buffer.clear();
  buffer.noStroke();
  buffer.fill(255);
  drawSvgContourSet(buffer, glyph, contours, scaleValue, expansion);
  return buffer;
}
