let sessionFaceDetectorPromise = null;

function resetSessionFaceDetection() {
  let detection = scene.session.faceDetection;
  detection.requestId++;
  detection.status = "idle";
  detection.boxes = [];
  detection.error = "";
}

async function createSessionFaceDetector() {
  let visionTasks = await import(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/vision_bundle.mjs"
  );
  let vision = await visionTasks.FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm",
  );
  return visionTasks.FaceDetector.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
      delegate: "GPU",
    },
    runningMode: "IMAGE",
    minDetectionConfidence: 0.5,
  });
}

function sessionFaceDetector() {
  if (sessionFaceDetectorPromise == null) {
    sessionFaceDetectorPromise = createSessionFaceDetector().catch(
      async () => {
        let visionTasks = await import(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/vision_bundle.mjs"
        );
        let vision = await visionTasks.FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm",
        );
        return visionTasks.FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
          },
          runningMode: "IMAGE",
          minDetectionConfidence: 0.5,
        });
      },
    );
  }
  return sessionFaceDetectorPromise;
}

async function detectSessionPhotoFaces(photo) {
  let detection = scene.session.faceDetection;
  let requestId = ++detection.requestId;
  detection.status = "loading";
  detection.boxes = [];
  detection.error = "";

  try {
    let detector = await sessionFaceDetector();
    if (requestId != detection.requestId || scene.session.photo != photo) return;
    let result = detector.detect(photo.canvas);
    if (requestId != detection.requestId || scene.session.photo != photo) return;
    detection.boxes = (result.detections || [])
      .map((face) => face.boundingBox)
      .filter((box) => box != null)
      .map((box) => ({
        x: box.originX / photo.width,
        y: box.originY / photo.height,
        width: box.width / photo.width,
        height: box.height / photo.height,
      }));
    detection.status = "ready";
    applyDetectedFacesToSessionPhotoFrame();
  } catch (error) {
    if (requestId != detection.requestId) return;
    detection.status = "unavailable";
    detection.error = error?.message || "Face detection is unavailable";
    console.warn("PlaySpace face detection is unavailable:", error);
  }
}
