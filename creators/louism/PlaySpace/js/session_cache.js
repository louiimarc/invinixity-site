const PLAYSPACE_SESSION_DATABASE = "playspace-session-v1";
const PLAYSPACE_SESSION_STORE = "sessions";
const PLAYSPACE_SESSION_KEY = "current";

let sessionCacheDatabasePromise = null;
let sessionCacheSaveTimer = null;
let sessionCachePhotoBlob = null;
let sessionCachePhotoChanged = false;
let sessionCacheGeneration = 0;

function openSessionCacheDatabase() {
  if (sessionCacheDatabasePromise != null) return sessionCacheDatabasePromise;
  sessionCacheDatabasePromise = new Promise((resolve, reject) => {
    let request = indexedDB.open(PLAYSPACE_SESSION_DATABASE, 1);
    request.onupgradeneeded = () => {
      let database = request.result;
      if (!database.objectStoreNames.contains(PLAYSPACE_SESSION_STORE)) {
        database.createObjectStore(PLAYSPACE_SESSION_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return sessionCacheDatabasePromise;
}

function sessionCacheTransaction(mode, callback) {
  return openSessionCacheDatabase().then(
    (database) =>
      new Promise((resolve, reject) => {
        let transaction = database.transaction(PLAYSPACE_SESSION_STORE, mode);
        let store = transaction.objectStore(PLAYSPACE_SESSION_STORE);
        callback(store);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      }),
  );
}

function sessionPhotoCanvasBlob(photo) {
  return new Promise((resolve, reject) => {
    if (photo?.canvas?.toBlob == null) {
      reject(new Error("Photo canvas cannot be cached"));
      return;
    }
    photo.canvas.toBlob(
      (blob) => (blob == null ? reject(new Error("Photo encoding failed")) : resolve(blob)),
      "image/jpeg",
      0.92,
    );
  });
}

async function saveSessionCache() {
  let generation = sessionCacheGeneration;
  let photo = scene.session.photo;
  if (photo == null) return;
  if (sessionCachePhotoBlob == null || sessionCachePhotoChanged) {
    sessionCachePhotoBlob = await sessionPhotoCanvasBlob(photo);
    if (generation != sessionCacheGeneration || scene.session.photo != photo) {
      return;
    }
    sessionCachePhotoChanged = false;
  }

  let frame = scene.session.photoFrame;
  let record = {
    id: PLAYSPACE_SESSION_KEY,
    photo: sessionCachePhotoBlob,
    photoWidth: photo.width,
    photoHeight: photo.height,
    canvasWidth: width,
    canvasHeight: height,
    compositionVersion: 2,
    frameClosed: frame.closed,
    framePoints: frame.points.map((point) => ({ x: point.x, y: point.y })),
    framePhotoPlacement: frame.photoPlacement == null
      ? null
      : { ...frame.photoPlacement },
    frameLayoutNormalized: frame.layoutNormalized === true,
    frameDeadlineAt: frame.deadlineAt,
    updatedAt: Date.now(),
  };
  await sessionCacheTransaction("readwrite", (store) => store.put(record));
  scene.text.hasSavedSession = true;
}

function scheduleSessionCacheSave(photoChanged = false) {
  if (photoChanged) sessionCacheGeneration++;
  sessionCachePhotoChanged = sessionCachePhotoChanged || photoChanged;
  if (sessionCacheSaveTimer != null) clearTimeout(sessionCacheSaveTimer);
  sessionCacheSaveTimer = setTimeout(() => {
    sessionCacheSaveTimer = null;
    saveSessionCache().catch((error) => {
      console.warn("Unable to cache PlaySpace photo session", error);
    });
  }, photoChanged ? 0 : 180);
}

function discardSessionCache() {
  sessionCacheGeneration++;
  if (sessionCacheSaveTimer != null) clearTimeout(sessionCacheSaveTimer);
  sessionCacheSaveTimer = null;
  sessionCachePhotoBlob = null;
  sessionCachePhotoChanged = false;
  return sessionCacheTransaction("readwrite", (store) => {
    store.delete(PLAYSPACE_SESSION_KEY);
  }).catch((error) => {
    console.warn("Unable to clear PlaySpace photo session", error);
  });
}

async function cachedSessionRecord() {
  let database = await openSessionCacheDatabase();
  return new Promise((resolve, reject) => {
    let transaction = database.transaction(PLAYSPACE_SESSION_STORE, "readonly");
    let request = transaction.objectStore(PLAYSPACE_SESSION_STORE).get(
      PLAYSPACE_SESSION_KEY,
    );
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

function loadCachedSessionPhoto(blob) {
  return new Promise((resolve, reject) => {
    let url = URL.createObjectURL(blob);
    loadImage(
      url,
      (photo) => {
        URL.revokeObjectURL(url);
        resolve(photo);
      },
      (error) => {
        URL.revokeObjectURL(url);
        reject(error);
      },
    );
  });
}

async function restoreSessionCache() {
  try {
    let record = await cachedSessionRecord();
    if (record?.photo == null) return false;

    let photo = await loadCachedSessionPhoto(record.photo);
    scene.session.photo = photo;
    sessionCachePhotoBlob = record.photo;
    sessionCachePhotoChanged = false;

    let storedWidth = max(1, record.canvasWidth || width);
    let storedHeight = max(1, record.canvasHeight || height);
    let fromBounds = record.compositionVersion === 2
      ? creationCardBounds(
        storedWidth,
        storedHeight,
        scene.ui.controlSide,
        scene.text.edit,
      )
      : record.compositionVersion === 1
      ? compositionBounds(
        storedWidth,
        storedHeight,
        scene.ui.controlSide,
        scene.text.edit,
      )
      : { x: 0, y: 0, width: storedWidth, height: storedHeight };
    let toBounds = creationCardBounds(
      width,
      height,
      scene.ui.controlSide,
      scene.text.edit,
    );
    let frame = scene.session.photoFrame;
    frame.points = Array.isArray(record.framePoints)
      ? record.framePoints
          .filter(
            (point) =>
              point != null &&
              Number.isFinite(point.x) &&
              Number.isFinite(point.y),
          )
          .map((point) => remapPointBetweenBounds(point, fromBounds, toBounds))
      : [];
    frame.closed = record.frameClosed === true && frame.points.length > 2;
    if (record.framePhotoPlacement != null) {
      let source = record.framePhotoPlacement;
      let topLeft = remapPointBetweenBounds(
        { x: source.x, y: source.y },
        fromBounds,
        toBounds,
      );
      frame.photoPlacement = {
        x: topLeft.x,
        y: topLeft.y,
        width: source.width * toBounds.width / max(1, fromBounds.width),
        height: source.height * toBounds.height / max(1, fromBounds.height),
      };
    } else {
      frame.photoPlacement = null;
    }
    frame.layoutNormalized = record.frameLayoutNormalized === true;
    frame.deadlineAt = Number.isFinite(record.frameDeadlineAt)
      ? record.frameDeadlineAt
      : Date.now() + frame.durationSeconds * 1000;
    frame.timeoutHandled = false;
    if (frame.closed && frame.photoPlacement == null) {
      normalizeSessionPhotoFrameLayout();
    }
    frame.drawing = false;
    frame.faceAdjustment = null;
    frame.faceRequestId = -1;
    frame.dirty = true;
    frame.reviewTransition = frame.closed ? 1 : 0;
    scene.session.restoreMode = frame.closed ? "active" : "frame";
    scene.text.hasSavedSession = true;
    detectSessionPhotoFaces(photo);
    return true;
  } catch (error) {
    console.warn("Unable to restore PlaySpace photo session", error);
    return false;
  }
}
