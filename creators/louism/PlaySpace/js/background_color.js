function defaultSessionBackgroundColor() {
  return { hue: 0, saturation: 0, brightness: 0.2 };
}

function resetSessionBackgroundColor() {
  scene.session.backgroundColor = defaultSessionBackgroundColor();
}

function sessionBackgroundRgb() {
  return hsvToRgbValues(scene.session.backgroundColor);
}

function drawSessionWorkspaceBackground() {
  if (["frame", "active"].includes(scene.session.mode)) {
    let rgb = sessionBackgroundRgb();
    scene.workspace.background(
      rgb[0] * 255,
      rgb[1] * 255,
      rgb[2] * 255,
    );
    return;
  }

  scene.workspace.push();
  scene.workspace.imageMode(CENTER);
  scene.workspace.image(checkerboardBuffer(), 0, 0, width, height);
  scene.workspace.pop();
}
