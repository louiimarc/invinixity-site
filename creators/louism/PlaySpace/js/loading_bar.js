data.loading.bar = function () {
  let realProgress = data.amount > 0 ? data.counter / data.amount : 1;
  let elapsed = scene.elapsedTime - data.loading.startedAt;
  if (abs(data.loading.position.y) < 24 * scene.ui.scale) {
    data.loading.arrived = true;
  }

  let canFinish =
    data.loading.arrived &&
    realProgress >= 1 &&
    elapsed >= data.loading.minimumDuration;
  data.loading.ready = canFinish;

  if (!canFinish) {
    data.loading.position.y = animateData(data.loading.position.y, 0.0, 0.125);
  } else {
    data.loading.position.y = animateData(
      data.loading.position.y,
      height,
      0.0625,
    );
  }

  if (data.loading.position.y < height + 200 * scene.ui.scale) {
    push();
    translate(0, 0, 16);

    rotateZ(cos(scene.elapsedTime * 90) * 5);
    rotateX(sin(scene.elapsedTime * 180) * 15);

    let progressTarget = data.loading.arrived ? realProgress : 0;
    data.loading.progress = animateData(
      data.loading.progress,
      progressTarget,
      canFinish ? 0.5 : 0.1,
    );
    data.animate = data.loading.progress;

    noStroke();
    fill(25);

    data.loading.interface.update(scene.elapsedTime, uiPointer(), uiPointerActive());
    let barSize = 68 * scene.ui.scale;
    data.loading.interface.slider(
      data.loading.position.x,
      data.loading.position.y,
      barSize * 4,
      barSize,
      barSize,
      data.animate,
      200,
      25,
    );
    pop();
  }
};
