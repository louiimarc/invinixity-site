var downloadHandoff = {
  storageKey: "playspace.download-handoff.v1",
  overlay: null,
  stage: "closed",
  config: null,
  downloadUrl: "",
  posterImageUrl: "",
  token: "",
  posterSnapshot: null,
  backgroundFrameIndex: 0,
  scanExpiresAt: 0,
  countdownTimer: null,
  requestId: 0,
  rotation: {
    angle: 0,
    velocity: 0,
    dragging: false,
    pointerId: null,
    lastX: 0,
    lastPointerAt: 0,
    lastFrameAt: 0,
    frameRequest: null,
    introActive: false,
    introStartedAt: 0,
    introDuration: 2400,
  },
};

const PLAYSPACE_CLOUD_HANDOFF_TIMEOUT = 15000;
const PLAYSPACE_LOCAL_HANDOFF_TIMEOUT = 12000;

function downloadHandoffElement(selector) {
  return downloadHandoff.overlay?.querySelector(selector) || null;
}

function applyDownloadHandoffRotation() {
  let rotator = downloadHandoffElement(".handoff-poster-rotator");
  if (rotator == null) return;
  rotator.style.transform =
    `rotateY(${downloadHandoff.rotation.angle}deg)`;
  rotator.classList.toggle(
    "is-dragging",
    downloadHandoff.rotation.dragging,
  );
}

function updateDownloadHandoffRotation(now) {
  let state = downloadHandoff.rotation;
  let elapsed = state.lastFrameAt > 0
    ? Math.min(0.05, (now - state.lastFrameAt) / 1000)
    : 0;
  state.lastFrameAt = now;

  if (
    downloadHandoff.stage == "download" &&
    downloadHandoff.overlay?.hidden === false
  ) {
    if (state.introActive && !state.dragging) {
      let progress = Math.min(
        1,
        (now - state.introStartedAt) / state.introDuration,
      );
      let eased = progress * progress * progress *
        (progress * (progress * 6 - 15) + 10);
      state.angle = eased * 360;
      if (progress >= 1) {
        state.introActive = false;
        state.angle = 360;
      }
    } else if (!state.dragging) {
      state.angle += state.velocity * elapsed;
      state.velocity *= Math.pow(0.94, elapsed * 60);
      if (Math.abs(state.velocity) < 8) {
        state.velocity = 0;
        let target = Math.round(state.angle / 180) * 180;
        let smoothing = 1 - Math.pow(0.82, elapsed * 60);
        state.angle += (target - state.angle) * smoothing;
        if (Math.abs(target - state.angle) < 0.08) state.angle = target;
      }
    }
    applyDownloadHandoffRotation();
  }
  state.frameRequest = window.requestAnimationFrame(
    updateDownloadHandoffRotation,
  );
}

function startDownloadHandoffRotation() {
  let state = downloadHandoff.rotation;
  state.angle = 0;
  state.velocity = 0;
  state.dragging = false;
  state.pointerId = null;
  state.lastFrameAt = 0;
  state.introActive = true;
  state.introStartedAt = performance.now();
  applyDownloadHandoffRotation();
  if (state.frameRequest == null) {
    state.frameRequest = window.requestAnimationFrame(
      updateDownloadHandoffRotation,
    );
  }
}

function setupDownloadHandoffRotation() {
  let rotator = downloadHandoffElement(".handoff-poster-rotator");
  if (rotator == null) return;
  let state = downloadHandoff.rotation;
  rotator.addEventListener("pointerdown", (event) => {
    if (downloadHandoff.stage != "download") return;
    event.preventDefault();
    state.introActive = false;
    state.dragging = true;
    state.pointerId = event.pointerId;
    state.lastX = event.clientX;
    state.lastPointerAt = event.timeStamp;
    state.velocity = 0;
    rotator.setPointerCapture(event.pointerId);
    applyDownloadHandoffRotation();
  });
  rotator.addEventListener("pointermove", (event) => {
    if (!state.dragging || event.pointerId != state.pointerId) return;
    event.preventDefault();
    let deltaX = event.clientX - state.lastX;
    let elapsed = Math.max(1, event.timeStamp - state.lastPointerAt) / 1000;
    let deltaAngle = deltaX * 0.45;
    state.angle += deltaAngle;
    state.velocity = Math.max(
      -720,
      Math.min(720, state.velocity * 0.35 + deltaAngle / elapsed * 0.65),
    );
    state.lastX = event.clientX;
    state.lastPointerAt = event.timeStamp;
    applyDownloadHandoffRotation();
  });
  let finishDrag = (event) => {
    if (!state.dragging || event.pointerId != state.pointerId) return;
    state.dragging = false;
    state.pointerId = null;
    applyDownloadHandoffRotation();
  };
  rotator.addEventListener("pointerup", finishDrag);
  rotator.addEventListener("pointercancel", finishDrag);
}

function setupDownloadHandoff() {
  if (downloadHandoff.overlay != null) return;

  let overlay = document.createElement("section");
  overlay.id = "download-handoff";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="handoff-card" role="dialog" aria-modal="true">
      <img
        class="handoff-edge-decoration handoff-edge-decoration-left"
        src="assets/home/background_top_left_graphic.png"
        alt=""
      >
      <img
        class="handoff-edge-decoration handoff-edge-decoration-right"
        src="assets/home/background_top_right_graphic.png"
        alt=""
      >
      <h1 class="handoff-title">Preparing your poster...</h1>
      <p class="handoff-copy">One moment while we make your download.</p>
      <div class="handoff-poster-wrap">
        <div class="handoff-poster-rotator">
          <div class="handoff-poster-face handoff-poster-front">
            <img class="handoff-poster" alt="Your finished PlaySpace poster">
          </div>
          <div class="handoff-poster-face handoff-poster-back">
            <img
              class="handoff-poster-back-art"
              src="${PLAYSPACE_CARD_BACK_PATH}"
              alt=""
            >
          </div>
        </div>
      </div>
      <div class="handoff-bottom">
        <div class="handoff-scan" hidden>
          <div class="handoff-qr-wrap">
            <img class="handoff-qr" alt="">
          </div>
          <div class="handoff-scan-copy">
            <p class="handoff-detail"></p>
            <p class="handoff-url" hidden></p>
            <span class="handoff-countdown" hidden>60</span>
          </div>
        </div>
        <button class="handoff-button" type="button" hidden>Finish</button>
      </div>
      <button class="handoff-secondary" type="button" hidden>Try again</button>
    </div>
  `;
  for (let eventName of [
    "pointerdown",
    "pointermove",
    "pointerup",
    "pointercancel",
    "touchstart",
    "touchmove",
    "touchend",
    "touchcancel",
    "click",
  ]) {
    overlay.addEventListener(eventName, (event) => event.stopPropagation());
  }
  document.body.appendChild(overlay);
  downloadHandoff.overlay = overlay;
  downloadHandoffElement(".handoff-button").addEventListener("click", () => {
    if (downloadHandoff.stage == "wifi") showPosterDownloadStep();
    else if (downloadHandoff.stage == "download") completeDownloadHandoff();
  });
  downloadHandoffElement(".handoff-secondary").addEventListener(
    "click",
    () => beginDownloadHandoff(downloadHandoff.posterSnapshot),
  );
  setupDownloadHandoffRotation();
}

function saveDownloadHandoff(expiresAt) {
  try {
    localStorage.setItem(
      downloadHandoff.storageKey,
      JSON.stringify({
        config: downloadHandoff.config,
        downloadUrl: downloadHandoff.downloadUrl,
        posterImageUrl: downloadHandoff.posterImageUrl,
        token: downloadHandoff.token,
        backgroundFrameIndex: downloadHandoff.backgroundFrameIndex,
        scanExpiresAt: downloadHandoff.scanExpiresAt,
        expiresAt,
        stage: downloadHandoff.config.skipWifi ? "download" : "wifi",
      }),
    );
  } catch (error) {
    console.warn("Unable to save poster download handoff", error);
  }
}

function discardDownloadHandoff() {
  try {
    localStorage.removeItem(downloadHandoff.storageKey);
  } catch (error) {
    console.warn("Unable to clear poster download handoff", error);
  }
}

function restoreDownloadHandoff() {
  setupDownloadHandoff();
  try {
    let saved = JSON.parse(
      localStorage.getItem(downloadHandoff.storageKey) || "null",
    );
    if (
      saved == null ||
      !(saved.expiresAt > Date.now()) ||
      typeof saved.downloadUrl != "string" ||
      saved.downloadUrl == ""
    ) {
      discardDownloadHandoff();
      return false;
    }
    downloadHandoff.config = saved.config;
    downloadHandoff.downloadUrl = saved.downloadUrl;
    downloadHandoff.token = saved.token || "";
    downloadHandoff.posterImageUrl = saved.posterImageUrl ||
      (downloadHandoff.token == ""
        ? ""
        : playSpaceApiUrl(`/poster/${downloadHandoff.token}.png`));
    downloadHandoff.backgroundFrameIndex =
      Number.isInteger(saved.backgroundFrameIndex)
        ? saved.backgroundFrameIndex
        : 0;
    downloadHandoff.scanExpiresAt = saved.scanExpiresAt ||
      Date.now() + 60000;
    prepareDownloadHandoffPosterScene();
    downloadHandoff.overlay.hidden = false;
    if (saved.stage == "wifi" && !saved.config.skipWifi) showWifiJoinStep();
    else showPosterDownloadStep();
    return true;
  } catch (error) {
    console.warn("Unable to restore poster download handoff", error);
    discardDownloadHandoff();
    return false;
  }
}

function setDownloadHandoffProgress(step) {
  downloadHandoff.overlay.dataset.step = String(step);
}

function escapeWifiQrValue(value) {
  return String(value).replaceAll(/([\\;,:"])/g, "\\$1");
}

function wifiQrPayload(config) {
  let hidden = config.wifiHidden ? "H:true;" : "";
  return `WIFI:T:${escapeWifiQrValue(config.wifiSecurity)};S:${escapeWifiQrValue(config.wifiName)};P:${escapeWifiQrValue(config.wifiPassword)};${hidden};`;
}

async function setDownloadHandoffQr(image, text) {
  if (image == null) return;
  let requestedText = String(text);
  image.dataset.qrText = requestedText;
  image.removeAttribute("src");
  try {
    if (globalThis.QRCode?.toString == null) {
      throw new Error("Browser QR renderer unavailable");
    }
    let svg = await globalThis.QRCode.toString(requestedText, {
      type: "svg",
      width: 512,
      errorCorrectionLevel: "M",
      margin: 2,
      color: { dark: "#1D1D1D", light: "#FFFFFF" },
    });
    let source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    if (image.dataset.qrText == requestedText) image.src = source;
  } catch (error) {
    console.warn("Unable to render QR code as SVG", error);
    try {
      if (globalThis.QRCode?.toDataURL == null) throw error;
      let source = await globalThis.QRCode.toDataURL(requestedText, {
        width: 512,
        errorCorrectionLevel: "M",
        margin: 2,
        color: { dark: "#1D1D1D", light: "#FFFFFF" },
      });
      if (image.dataset.qrText == requestedText) image.src = source;
    } catch (fallbackError) {
      console.warn("Unable to render QR code as PNG", fallbackError);
      if (image.dataset.qrText == requestedText) {
        image.src =
          `${window.location.origin}/api/qr?text=${encodeURIComponent(
            requestedText,
          )}`;
      }
    }
  }
}

function dataUrlBlob(dataUrl) {
  let [header, encoded] = dataUrl.split(",", 2);
  let mimeType = header.match(/^data:([^;]+)/)?.[1] || "image/png";
  let binary = atob(encoded);
  let bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

function cardPreviewPosterBlob(snapshot) {
  if (snapshot == null) throw new Error("The poster preview is unavailable");
  return dataUrlBlob(snapshot.canvas.toDataURL("image/png"));
}

function downloadHandoffTimeoutError(label) {
  return new Error(`${label} took too long. Tap Try again.`);
}

function normalizeCloudDownloadError(error) {
  if (error?.name == "AbortError") {
    return downloadHandoffTimeoutError("Online poster upload");
  }
  if (error instanceof TypeError) {
    return new Error(
      "The online download service could not be reached. Tap Try again.",
    );
  }
  return error;
}

async function fetchDownloadHandoffWithTimeout(
  url,
  options,
  timeout,
  timeoutLabel,
) {
  let controller = new AbortController();
  let timer = window.setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw downloadHandoffTimeoutError(timeoutLabel);
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

async function requestCloudDownloadSession(posterBlob) {
  let controller = new AbortController();
  let timer = window.setTimeout(
    () => controller.abort(),
    PLAYSPACE_CLOUD_HANDOFF_TIMEOUT,
  );
  try {
    let configResponse = await fetch(playSpaceApiUrl("/api/config"), {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!configResponse.ok) throw new Error("Download service unavailable");
    let config = await configResponse.json();
    let posterResponse = await fetch(playSpaceApiUrl("/api/posters"), {
      method: "POST",
      headers: { "Content-Type": "image/png" },
      body: posterBlob,
      signal: controller.signal,
    });
    if (!posterResponse.ok) throw new Error("Unable to save poster");
    let session = await posterResponse.json();
    if (session.exampleUrl == null) {
      let exampleResponse = await fetch(playSpaceApiUrl("/api/examples"), {
        method: "POST",
        headers: { "Content-Type": "image/png" },
        body: posterBlob,
        signal: controller.signal,
      });
      if (!exampleResponse.ok) throw new Error("Unable to save poster example");
      let savedExample = await exampleResponse.json();
      session.exampleUrl = savedExample.url;
    }
    return { config, session, localFallback: false };
  } catch (error) {
    throw normalizeCloudDownloadError(error);
  } finally {
    window.clearTimeout(timer);
  }
}

async function requestLocalDownloadSession(posterBlob) {
  let response = await fetchDownloadHandoffWithTimeout(
    `${window.location.origin}/api/posters`,
    {
      method: "POST",
      headers: { "Content-Type": "image/png" },
      body: posterBlob,
    },
    PLAYSPACE_LOCAL_HANDOFF_TIMEOUT,
    "Saving this poster on the kiosk Mac",
  );
  if (!response.ok) throw new Error("Unable to save poster on this Mac");
  return {
    config: {
      publicOrigin: window.location.origin,
      wifiName: "PlaySpace",
      wifiPassword: "",
      wifiSecurity: "WPA",
      skipWifi: true,
      expiryMinutes: 15,
    },
    session: await response.json(),
    localFallback: true,
  };
}

async function beginDownloadHandoff(posterSnapshot) {
  if (posterSnapshot == null) {
    console.error("Refused to begin a download without a finished poster.");
    return;
  }
  let requestId = ++downloadHandoff.requestId;
  setupDownloadHandoff();
  downloadHandoff.posterSnapshot = posterSnapshot;
  downloadHandoff.posterImageUrl = posterSnapshot?.canvas?.toDataURL(
    "image/png",
  ) || "";
  downloadHandoff.backgroundFrameIndex =
    scene.session.backgroundFrameIndex ?? 0;
  downloadHandoff.scanExpiresAt = 0;
  prepareDownloadHandoffPosterScene();
  downloadHandoff.stage = "preparing";
  downloadHandoffElement(".handoff-card")?.classList.remove("is-poster-scene");
  downloadHandoff.overlay.hidden = false;
  downloadHandoffElement(".handoff-title").textContent =
    "Preparing your poster...";
  downloadHandoffElement(".handoff-copy").textContent =
    "One moment while we make your download.";
  downloadHandoffElement(".handoff-copy").hidden = false;
  downloadHandoffElement(".handoff-scan").hidden = true;
  downloadHandoffElement(".handoff-button").hidden = true;
  downloadHandoffElement(".handoff-secondary").hidden = true;
  setDownloadHandoffProgress(1);

  try {
    let posterBlob = cardPreviewPosterBlob(posterSnapshot);
    let result;
    try {
      result = await requestCloudDownloadSession(posterBlob);
    } catch (cloudError) {
      if (!playSpaceRunsOnLocalKioskHost()) throw cloudError;
      console.warn(
        "Cloud poster handoff unavailable; using this Mac instead",
        cloudError,
      );
      result = await requestLocalDownloadSession(posterBlob);
    }
    if (requestId != downloadHandoff.requestId) return;
    let session = result.session;
    downloadHandoff.config = result.config;
    downloadHandoff.downloadUrl = session.downloadUrl;
    downloadHandoff.token = session.token;
    downloadHandoff.posterImageUrl = session.posterImageUrl ||
      `${new URL(session.downloadUrl).origin}/poster/${session.token}.png`;
    downloadHandoff.scanExpiresAt = Date.now() + 60000;
    prepareDownloadHandoffPosterScene();
    if (!result.localFallback) refreshHomeExamples();
    saveDownloadHandoff(session.expiresAt);
    if (downloadHandoff.config.skipWifi) showPosterDownloadStep();
    else showWifiJoinStep();
  } catch (error) {
    if (requestId != downloadHandoff.requestId) return;
    console.error("Unable to prepare local poster download", error);
    showDownloadHandoffError(error);
  }
}

function prepareDownloadHandoffPosterScene() {
  let card = downloadHandoffElement(".handoff-card");
  if (card != null) card.style.backgroundImage = "";
  let poster = downloadHandoffElement(".handoff-poster");
  if (poster != null && downloadHandoff.posterImageUrl != "") {
    poster.src = downloadHandoff.posterImageUrl;
  }
  let back = downloadHandoffElement(".handoff-poster-back");
  let backgroundPath = PLAYSPACE_CARD_BACK_BACKGROUND_PATHS[
    downloadHandoff.backgroundFrameIndex
  ] || PLAYSPACE_CARD_BACK_BACKGROUND_PATHS[0];
  if (back != null) {
    back.style.backgroundImage = `url("${backgroundPath}")`;
  }
}

function stopDownloadScanCountdown() {
  if (downloadHandoff.countdownTimer != null) {
    window.clearInterval(downloadHandoff.countdownTimer);
    downloadHandoff.countdownTimer = null;
  }
}

function updateDownloadScanCountdown() {
  let countdown = downloadHandoffElement(".handoff-countdown");
  if (countdown == null) return;
  let seconds = Math.max(
    0,
    Math.ceil((downloadHandoff.scanExpiresAt - Date.now()) / 1000),
  );
  countdown.textContent = String(seconds);
  if (seconds <= 0 && downloadHandoff.stage == "download") {
    completeDownloadHandoff();
  }
}

function startDownloadScanCountdown() {
  stopDownloadScanCountdown();
  if (!(downloadHandoff.scanExpiresAt > 0)) {
    downloadHandoff.scanExpiresAt = Date.now() + 60000;
  }
  if (downloadHandoff.scanExpiresAt <= Date.now()) {
    completeDownloadHandoff();
    return;
  }
  updateDownloadScanCountdown();
  downloadHandoff.countdownTimer = window.setInterval(
    updateDownloadScanCountdown,
    250,
  );
}

function showWifiJoinStep() {
  let config = downloadHandoff.config;
  downloadHandoff.stage = "wifi";
  downloadHandoffElement(".handoff-card")?.classList.remove("is-poster-scene");
  setDownloadHandoffProgress(1);
  downloadHandoffElement(".handoff-title").textContent =
    `Please scan to join “${config.wifiName}”`;
  downloadHandoffElement(".handoff-copy").textContent =
    "Open your phone camera and point it at this QR code.";
  downloadHandoffElement(".handoff-copy").hidden = false;
  let qr = downloadHandoffElement(".handoff-qr");
  qr.alt = `QR code to join ${config.wifiName} Wi-Fi`;
  setDownloadHandoffQr(qr, wifiQrPayload(config));
  downloadHandoffElement(".handoff-scan").hidden = false;
  let detail = downloadHandoffElement(".handoff-detail");
  detail.textContent = `Wi-Fi: ${config.wifiName}`;
  downloadHandoffElement(".handoff-url").hidden = true;
  downloadHandoffElement(".handoff-countdown").hidden = true;
  let button = downloadHandoffElement(".handoff-button");
  button.textContent = "Next";
  button.classList.remove("is-final");
  button.hidden = false;
}

function showPosterDownloadStep() {
  downloadHandoff.stage = "download";
  downloadHandoffElement(".handoff-card")?.classList.add("is-poster-scene");
  setDownloadHandoffProgress(2);
  downloadHandoffElement(".handoff-title").textContent =
    "Your own Poster is finished!";
  downloadHandoffElement(".handoff-copy").hidden = true;
  let qr = downloadHandoffElement(".handoff-qr");
  qr.alt = "QR code to download your PlaySpace poster";
  setDownloadHandoffQr(qr, downloadHandoff.downloadUrl);
  downloadHandoffElement(".handoff-scan").hidden = false;
  let detail = downloadHandoffElement(".handoff-detail");
  detail.textContent = "Scan QR\nto save poster!";
  let url = downloadHandoffElement(".handoff-url");
  url.textContent = downloadHandoff.downloadUrl;
  url.hidden = true;
  downloadHandoffElement(".handoff-countdown").hidden = false;
  let button = downloadHandoffElement(".handoff-button");
  button.textContent = "FINISH";
  button.classList.add("is-final");
  button.hidden = false;
  downloadHandoffElement(".handoff-secondary").hidden = true;
  startDownloadHandoffRotation();
  startDownloadScanCountdown();
}

function showDownloadHandoffError(error) {
  downloadHandoff.stage = "error";
  downloadHandoffElement(".handoff-card")?.classList.remove("is-poster-scene");
  downloadHandoffElement(".handoff-title").textContent =
    "The download station needs attention";
  downloadHandoffElement(".handoff-copy").textContent =
    `Your poster is still available. ${error?.message || "Please try again."}`;
  downloadHandoffElement(".handoff-scan").hidden = true;
  downloadHandoffElement(".handoff-button").hidden = true;
  downloadHandoffElement(".handoff-secondary").hidden = false;
}

function closeDownloadHandoff() {
  downloadHandoff.requestId++;
  stopDownloadScanCountdown();
  downloadHandoff.stage = "closed";
  downloadHandoff.downloadUrl = "";
  downloadHandoff.posterImageUrl = "";
  downloadHandoff.token = "";
  downloadHandoff.posterSnapshot = null;
  downloadHandoffElement(".handoff-card")?.classList.remove("is-poster-scene");
  downloadHandoff.overlay.hidden = true;
}

function completeDownloadHandoff() {
  discardDownloadHandoff();
  finishPlaySession();
  closeDownloadHandoff();
  refreshHomeExamples();
}
