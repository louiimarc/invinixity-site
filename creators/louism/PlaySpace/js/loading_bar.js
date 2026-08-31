data.loading.bar = function () {
  if (
    scene.session.cameraPrompt.confirming ||
    ["frame", "secretDemo", "secretDemoLoading"].includes(
      scene.session.mode,
    )
  ) {
    data.loading.interface.bounds = null;
    return;
  }

  let realProgress = data.amount > 0 ? data.counter / data.amount : 1;
  let elapsed = scene.elapsedTime - data.loading.startedAt;
  if (!data.loading.status && data.loading.completedAt == null) {
    data.loading.completedAt = scene.elapsedTime;
  }

  if (abs(data.loading.position.y) < 24 * scene.ui.scale) {
    data.loading.arrived = true;
  }

  let canFinish =
    data.loading.arrived &&
    realProgress >= 1 &&
    elapsed >= data.loading.minimumDuration;
  data.loading.ready = canFinish;

  if (canFinish && scene.session.mode == "loading") {
    scene.session.mode = scene.session.restoreMode || "idle";
    scene.session.restoreMode = null;
  }

  if (canFinish && scene.session.mode == "active") {
    data.loading.interface.bounds = null;
    data.loading.position.y = height;
    return;
  }

  let homeTargetY = canFinish && scene.session.mode == "idle"
    ? height * 0.36
    : 0;
  data.loading.position.y = animateData(
    data.loading.position.y,
    homeTargetY,
    0.125,
  );
  if (data.loading.position.y < height + 200 * scene.ui.scale) {
    push();
    translate(0, 0, 16);

    let progressTarget = data.loading.arrived ? realProgress : 0;
    data.loading.progress = animateData(
      data.loading.progress,
      progressTarget,
      canFinish ? 0.5 : 0.1,
    );
    data.animate = data.loading.progress;

    data.loading.interface.armed =
      canFinish && scene.ui.pointer.pressTarget == "sessionStart";
    let barSize = 68 * scene.ui.scale;
    if (canFinish) {
      drawFlowSliceButton(
        data.loading.interface,
        "play",
        data.loading.position.x,
        data.loading.position.y,
        barSize * 4.8,
        barSize * 1.7,
      );
    } else {
      data.loading.interface.bounds = null;
      resetShader();
      noStroke();
      fill(255, 235, 221, 90);
      rectMode(CENTER);
      rect(
        data.loading.position.x,
        data.loading.position.y,
        barSize * 4,
        12 * scene.ui.scale,
        6 * scene.ui.scale,
      );
      fill(0, 26);
      rectMode(CORNER);
      rect(
        data.loading.position.x - barSize * 2,
        data.loading.position.y - 6 * scene.ui.scale,
        barSize * 4 * data.animate,
        12 * scene.ui.scale,
        6 * scene.ui.scale,
      );
      textAlign(CENTER, BOTTOM);
      textFont(scene.text.font || scene.font);
      textSize(20 * scene.ui.scale);
      fill(255);
      text(
        "Loading",
        data.loading.position.x,
        data.loading.position.y - 18 * scene.ui.scale,
      );
    }
    pop();
  }
};
