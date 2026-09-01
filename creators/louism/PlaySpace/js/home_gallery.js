const PLAYSPACE_HOME_GALLERY_INTERVAL = 5000;
const PLAYSPACE_HIDDEN_HOME_EXAMPLES_KEY =
  "playspace.hidden-home-examples.v1";

scene.homeGallery = {
  assetPaths: {
    logo: "assets/branding/playspace_logo.svg",
    topLeft: "assets/home/background_top_left_graphic.png",
    topCenter: "assets/home/background_top_centered_graphic.png",
    topRight: "assets/home/background_top_right_graphic.png",
    title: "assets/home/create_your_own_poster_title.png",
    ideaFest: "assets/branding/ideafest_logo.png",
  },
  assets: Object.create(null),
  gradientBuffer: null,
  gradientWidth: 0,
  gradientHeight: 0,
  examples: [],
  hiddenExampleIds: new Set(),
  moderation: {
    open: false,
    saving: false,
    draftHiddenIds: new Set(),
    element: null,
  },
  exampleRequestId: 0,
  position: 0,
  targetPosition: 0,
  lastAutoAt: 0,
  bounds: null,
  drag: {
    active: false,
    moved: false,
    startX: 0,
    previousX: 0,
    previousAt: 0,
    velocity: 0,
  },
};

function preloadHomeGalleryAssets() {
  let entries = Object.entries(scene.homeGallery.assetPaths);
  data.amount += entries.length - 1;
  for (let [key, path] of entries) {
    scene.homeGallery.assets[key] = loadImage(
      path,
      loaded,
      (error) => {
        console.warn(`Unable to load PlaySpace home asset ${path}`, error);
        loaded();
      },
    );
  }
}

function setupHomeGallery() {
  restoreHiddenHomeExamples();
  data.amount++;
  data.loading.status = true;
  refreshHomeExamples().finally(loaded);
}

function homeGalleryRelativeSlot(index, position, count) {
  let slot = index - position;
  while (slot > count / 2) slot -= count;
  while (slot < -count / 2) slot += count;
  return slot;
}

function homeGalleryDisplayCards() {
  let state = scene.homeGallery;
  return state.examples.filter(
    (card) => !state.hiddenExampleIds.has(homeExampleId(card.url)),
  );
}

function homeExampleId(url) {
  try {
    return decodeURIComponent(new URL(url, window.location.href).pathname);
  } catch (error) {
    return String(url || "");
  }
}

function restoreHiddenHomeExamples() {
  try {
    let saved = JSON.parse(
      localStorage.getItem(PLAYSPACE_HIDDEN_HOME_EXAMPLES_KEY) || "[]",
    );
    scene.homeGallery.hiddenExampleIds = new Set(
      Array.isArray(saved)
        ? saved.filter((value) => typeof value == "string")
        : [],
    );
  } catch (error) {
    scene.homeGallery.hiddenExampleIds = new Set();
    console.warn("Unable to restore hidden PlaySpace examples", error);
  }
}

function saveHiddenHomeExamples() {
  try {
    localStorage.setItem(
      PLAYSPACE_HIDDEN_HOME_EXAMPLES_KEY,
      JSON.stringify([...scene.homeGallery.hiddenExampleIds]),
    );
  } catch (error) {
    console.warn("Unable to save hidden PlaySpace examples", error);
  }
}

function validHiddenHomeExampleIds(values) {
  if (!Array.isArray(values)) return [];
  return values.filter((value) =>
    typeof value == "string" &&
    /^\/example\/\d{13}-[A-Za-z0-9_-]+\.png$/.test(value)
  );
}

function applyHiddenHomeExamples(values) {
  let state = scene.homeGallery;
  state.hiddenExampleIds = new Set(validHiddenHomeExampleIds(values));
  saveHiddenHomeExamples();
  state.position = 0;
  state.targetPosition = 0;
  state.lastAutoAt = millis();
}

async function publishHiddenHomeExamples(values) {
  let response = await fetch(playSpaceApiUrl("/api/examples/moderation"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ excludedExampleIds: [...values] }),
  });
  let payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    let error = new Error(
      payload.error || `Moderation service returned ${response.status}`,
    );
    error.status = response.status;
    throw error;
  }
  return validHiddenHomeExampleIds(payload.excludedExampleIds);
}

function homeGalleryModerationErrorMessage(error) {
  if (error?.status == 404) {
    return "The cloud gallery needs the updated PlaySpace Worker. " +
      "Deploy the supplied PlaySpace_Worker.js, then tap Try again.";
  }
  if (error?.status == 403) {
    return "This kiosk address is not allowed by the cloud gallery Worker.";
  }
  if (Number.isFinite(error?.status)) {
    return `Cloud gallery could not save (error ${error.status}). ` +
      "Tap Try again.";
  }
  return "Could not reach the shared gallery. Check the internet connection.";
}

function closeHomeGalleryModeration(saveChanges = false) {
  let state = scene.homeGallery;
  let moderation = state.moderation;
  if (!moderation.open || moderation.saving) return false;
  if (saveChanges) {
    applyHiddenHomeExamples([...moderation.draftHiddenIds]);
  }
  moderation.element?.remove();
  moderation.element = null;
  moderation.draftHiddenIds.clear();
  moderation.saving = false;
  moderation.open = false;
  return true;
}

function openHomeGalleryModeration() {
  let state = scene.homeGallery;
  let moderation = state.moderation;
  if (scene.session.mode != "idle" || moderation.open) return false;
  let availableIds = new Set(
    state.examples.map((card) => homeExampleId(card.url)),
  );
  moderation.draftHiddenIds = new Set(
    [...state.hiddenExampleIds].filter((id) => availableIds.has(id)),
  );
  moderation.saving = false;

  let overlay = document.createElement("section");
  overlay.className = "home-moderation";
  overlay.setAttribute("aria-label", "Home gallery moderation");

  let header = document.createElement("header");
  let heading = document.createElement("div");
  let title = document.createElement("h1");
  title.textContent = "Choose examples for Home";
  let note = document.createElement("p");
  note.textContent = "Dimmed examples are excluded. Tap again to include them.";
  heading.append(title, note);

  let cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "home-moderation__cancel";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", () => closeHomeGalleryModeration(false));
  header.append(heading, cancel);

  let grid = document.createElement("div");
  grid.className = "home-moderation__grid";
  if (state.examples.length == 0) {
    let empty = document.createElement("p");
    empty.className = "home-moderation__empty";
    empty.textContent = "No cloud examples are available.";
    grid.append(empty);
  }
  for (let card of state.examples) {
    let id = homeExampleId(card.url);
    let button = document.createElement("button");
    button.type = "button";
    button.className = "home-moderation__card";
    let image = document.createElement("img");
    image.src = card.url;
    image.alt = "PlaySpace poster example";
    image.draggable = false;
    let label = document.createElement("span");
    label.textContent = "Excluded";
    button.append(image, label);

    let updateState = () => button.setAttribute(
      "aria-pressed",
      moderation.draftHiddenIds.has(id) ? "true" : "false",
    );
    updateState();
    button.addEventListener("click", () => {
      if (moderation.draftHiddenIds.has(id)) {
        moderation.draftHiddenIds.delete(id);
      } else {
        moderation.draftHiddenIds.add(id);
      }
      updateState();
    });
    grid.append(button);
  }

  let done = document.createElement("button");
  done.type = "button";
  done.className = "home-moderation__done";
  done.textContent = "Done";
  done.addEventListener("click", async () => {
    if (moderation.saving) return;
    moderation.saving = true;
    done.disabled = true;
    cancel.disabled = true;
    done.textContent = "Saving...";
    try {
      let saved = await publishHiddenHomeExamples(
        moderation.draftHiddenIds,
      );
      moderation.saving = false;
      moderation.draftHiddenIds = new Set(saved);
      closeHomeGalleryModeration(true);
    } catch (error) {
      console.warn("Unable to publish PlaySpace gallery moderation", error);
      moderation.saving = false;
      done.disabled = false;
      cancel.disabled = false;
      done.textContent = "Try again";
      note.textContent = homeGalleryModerationErrorMessage(error);
    }
  });

  overlay.append(header, grid, done);
  document.body.append(overlay);
  moderation.element = overlay;
  moderation.open = true;
  return true;
}

function toggleHomeGalleryModeration() {
  return scene.homeGallery.moderation.open
    ? closeHomeGalleryModeration(false)
    : openHomeGalleryModeration();
}

async function refreshHomeExamples() {
  let state = scene.homeGallery;
  let requestId = ++state.exampleRequestId;
  try {
    let response = await fetch(playSpaceApiUrl("/api/examples"), {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Example service unavailable");
    let payload = await response.json();
    let urls = Array.isArray(payload.examples) ? payload.examples : [];
    if (Array.isArray(payload.excludedExampleIds)) {
      applyHiddenHomeExamples(payload.excludedExampleIds);
    }
    let cards = await Promise.all(urls.map((url) => new Promise((resolve) => {
      loadImage(
        `${url}?v=${Date.now()}`,
        (thumbnail) => resolve({ thumbnail, url }),
        (error) => {
          console.warn(`Unable to load PlaySpace example ${url}`, error);
          resolve(null);
        },
      );
    })));
    if (requestId != state.exampleRequestId) return;
    state.examples = cards.filter((card) => card != null);
    state.position = 0;
    state.targetPosition = 0;
    state.lastAutoAt = millis();
  } catch (error) {
    if (requestId != state.exampleRequestId) return;
    state.examples = [];
    console.warn("Unable to refresh PlaySpace examples", error);
  }
}

function homeGalleryLayout() {
  let cardHeight = min(width, height) * 0.6;
  let cardWidth = cardHeight * 9 / 16;
  let centerY = height * 0.05;
  let spacing = cardWidth * 0.96;
  return {
    cardWidth,
    cardHeight,
    centerY,
    spacing,
    bounds: {
      x: 0,
      y: centerY,
      w: min(width, cardWidth * 4.8),
      h: cardHeight * 1.16,
    },
  };
}

function homeGradientBuffer() {
  let state = scene.homeGallery;
  if (
    state.gradientBuffer == null ||
    state.gradientWidth != width ||
    state.gradientHeight != height
  ) {
    let buffer = state.gradientBuffer;
    if (buffer == null) {
      buffer = createGraphics(width, height);
      buffer.pixelDensity(1);
      state.gradientBuffer = buffer;
    } else {
      buffer.resizeCanvas(width, height);
    }
    let context = buffer.drawingContext;
    let base = context.createLinearGradient(0, 0, width, height);
    base.addColorStop(0, "#fff8e9");
    base.addColorStop(0.44, "#f7c7dc");
    base.addColorStop(1, "#dcebf4");
    context.fillStyle = base;
    context.fillRect(0, 0, width, height);

    let pink = context.createRadialGradient(
      width * 0.84,
      height * 0.08,
      0,
      width * 0.84,
      height * 0.08,
      max(width, height) * 0.72,
    );
    pink.addColorStop(0, "rgba(255, 181, 216, 0.66)");
    pink.addColorStop(1, "rgba(255, 181, 216, 0)");
    context.fillStyle = pink;
    context.fillRect(0, 0, width, height);

    let cream = context.createRadialGradient(
      width * 0.08,
      height * 0.14,
      0,
      width * 0.08,
      height * 0.14,
      max(width, height) * 0.62,
    );
    cream.addColorStop(0, "rgba(255, 252, 225, 0.8)");
    cream.addColorStop(1, "rgba(255, 252, 225, 0)");
    context.fillStyle = cream;
    context.fillRect(0, 0, width, height);
    state.gradientWidth = width;
    state.gradientHeight = height;
  }
  return state.gradientBuffer;
}

function drawHomeAsset(
  target,
  key,
  x,
  y,
  maximumWidth,
  maximumHeight,
  angle = 0,
) {
  let asset = scene.homeGallery.assets[key];
  if (asset == null || asset.width <= 1 || asset.height <= 1) return;
  let scale = min(maximumWidth / asset.width, maximumHeight / asset.height);
  target.push();
  target.translate(x, y);
  target.rotate(angle);
  target.imageMode(CENTER);
  target.image(
    asset,
    0,
    0,
    asset.width * scale,
    asset.height * scale,
  );
  target.pop();
}

function drawHomeBackground(target) {
  target.imageMode(CENTER);
  target.image(homeGradientBuffer(), 0, 0, width, height);

  drawHomeAsset(
    target,
    "topCenter",
    0,
    -height * 0.22,
    width * 0.96,
    height * 0.56,
  );
  drawHomeAsset(
    target,
    "topLeft",
    -width * 0.42 + sin(scene.elapsedTime * 42) * 5 * scene.ui.scale,
    -height * 0.36 + cos(scene.elapsedTime * 31) * 4 * scene.ui.scale,
    width * 0.42,
    height * 0.42,
    sin(scene.elapsedTime * 37) * 1.15,
  );
  drawHomeAsset(
    target,
    "topRight",
    width * 0.4 + cos(scene.elapsedTime * 36) * 5 * scene.ui.scale,
    -height * 0.36 + sin(scene.elapsedTime * 29) * 4 * scene.ui.scale,
    width * 0.34,
    height * 0.36,
    cos(scene.elapsedTime * 33) * 1.1,
  );
  drawHomeAsset(
    target,
    "logo",
    0,
    -height * 0.365,
    width * 0.42,
    height * 0.18,
  );
  drawHomeAsset(
    target,
    "title",
    0,
    -height * 0.225,
    width * 0.76,
    height * 0.075,
  );
  let ideaFestSize = min(width, height) * 0.105;
  drawHomeAsset(
    target,
    "ideaFest",
    width / 2 - ideaFestSize * 0.78,
    height / 2 - ideaFestSize * 0.78,
    ideaFestSize,
    ideaFestSize,
  );
}

function pointInsideHomeGallery(x, y) {
  let bounds = scene.homeGallery.bounds;
  if (bounds == null || scene.session.mode != "idle") return false;
  let centeredX = x - width / 2;
  let centeredY = y - height / 2;
  return (
    centeredX >= bounds.x - bounds.w / 2 &&
    centeredX <= bounds.x + bounds.w / 2 &&
    centeredY >= bounds.y - bounds.h / 2 &&
    centeredY <= bounds.y + bounds.h / 2
  );
}

function beginHomeGalleryGesture() {
  let state = scene.homeGallery;
  if (homeGalleryDisplayCards().length < 2) return false;
  if (!pointInsideHomeGallery(mouseX, mouseY)) return false;
  state.drag.active = true;
  state.drag.moved = false;
  state.drag.startX = mouseX;
  state.drag.previousX = mouseX;
  state.drag.previousAt = millis();
  state.drag.velocity = 0;
  return true;
}

function updateHomeGalleryGesture() {
  let state = scene.homeGallery;
  if (!state.drag.active) return false;
  let layout = homeGalleryLayout();
  let now = millis();
  let deltaX = mouseX - state.drag.previousX;
  let elapsed = max(1, now - state.drag.previousAt);
  state.position -= deltaX / layout.spacing;
  state.targetPosition = state.position;
  state.drag.velocity = deltaX / elapsed;
  state.drag.previousX = mouseX;
  state.drag.previousAt = now;
  state.drag.moved ||= abs(mouseX - state.drag.startX) > 8 * scene.ui.scale;
  return true;
}

function endHomeGalleryGesture() {
  let state = scene.homeGallery;
  if (!state.drag.active) return false;
  state.drag.active = false;
  let layout = homeGalleryLayout();
  if (state.drag.moved) {
    let projected = state.position -
      state.drag.velocity * 180 / layout.spacing;
    state.targetPosition = round(projected);
  } else {
    let centeredX = state.drag.startX - width / 2;
    let tapDirection = abs(centeredX) < layout.cardWidth * 0.34
      ? 0
      : Math.sign(centeredX);
    state.targetPosition = round(state.position) + tapDirection;
  }
  state.lastAutoAt = millis();
  return true;
}

function drawHomeGallery(target = scene.workspace) {
  if (scene.session.mode != "idle") return;
  let state = scene.homeGallery;
  target.push();
  target.resetShader();
  target.noStroke();
  drawHomeBackground(target);

  let readyCards = homeGalleryDisplayCards();
  if (readyCards.length > 0) {
    if (
      !state.drag.active &&
      millis() - state.lastAutoAt >= PLAYSPACE_HOME_GALLERY_INTERVAL
    ) {
      state.targetPosition = round(state.targetPosition) + 1;
      state.lastAutoAt = millis();
    }
    if (!state.drag.active) {
      state.position = animateData(
        state.position,
        state.targetPosition,
        0.1,
      );
    }
    let gallery = homeGalleryLayout();
    state.bounds = gallery.bounds;
    let layouts = readyCards.map((card, index) => ({
      card,
      slot: homeGalleryRelativeSlot(index, state.position, readyCards.length),
    })).sort((first, second) => abs(second.slot) - abs(first.slot));

    let gl = target._renderer.GL;
    let depthTestEnabled = gl.isEnabled(gl.DEPTH_TEST);
    let depthWriteEnabled = gl.getParameter(gl.DEPTH_WRITEMASK);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    try {
      for (let cardLayout of layouts) {
        let distance = abs(cardLayout.slot);
        let direction = cardLayout.slot == 0 ? 0 : Math.sign(cardLayout.slot);
        let scaleValue = max(0.68, 1 - distance * 0.15);
        let x = cardLayout.slot * gallery.spacing;
        let halfWidth = gallery.cardWidth * scaleValue / 2;
        if (x + halfWidth < -width / 2 || x - halfWidth > width / 2) {
          continue;
        }
        let y = gallery.centerY + distance * 10 * scene.ui.scale;
        let angleY = -direction * min(24, distance * 17);
        target.push();
        target.translate(x, y);
        target.rotateY(angleY);
        target.rotateZ(cardLayout.slot * 1.5);
        target.rectMode(CENTER);
        target.noStroke();
        target.fill(0, 45);
        target.rect(
          7 * scene.ui.scale,
          9 * scene.ui.scale,
          gallery.cardWidth * scaleValue,
          gallery.cardHeight * scaleValue,
          5 * scene.ui.scale,
        );
        target.imageMode(CENTER);
        target.image(
          cardLayout.card.thumbnail,
          0,
          0,
          gallery.cardWidth * scaleValue,
          gallery.cardHeight * scaleValue,
        );
        target.pop();
      }
    } finally {
      gl.depthMask(depthWriteEnabled);
      if (depthTestEnabled) gl.enable(gl.DEPTH_TEST);
    }
  } else {
    state.bounds = null;
  }
  target.pop();
}
