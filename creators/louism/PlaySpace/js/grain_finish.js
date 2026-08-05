function createGrainFinishTexture() {
  let state = scene.grain;
  let size = state.tileSize;
  let tile = createImage(size, size);
  let seed = 0x706c6179;

  tile.loadPixels();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      let first = seed >>> 24;
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      let second = seed >>> 24;
      let value = round((first + second) / 2);
      let index = (x + y * size) * 4;
      tile.pixels[index] = value;
      tile.pixels[index + 1] = value;
      tile.pixels[index + 2] = value;
      tile.pixels[index + 3] = 255;
    }
  }
  tile.updatePixels();
  state.tile = tile;
}

function drawGrainFinish(target) {
  let state = scene.grain;
  if (target == null || state.tile == null || scene.grainShader == null) {
    return;
  }

  let gl = target._renderer.GL;
  target.push();
  target.resetMatrix();
  target.ortho();
  gl.clear(gl.DEPTH_BUFFER_BIT);
  target.blendMode(BLEND);
  target.noStroke();
  target.fill(255, 1);
  target.rectMode(CENTER);
  target.shader(scene.grainShader);
  scene.grainShader.setUniform("u_noise", state.tile);
  scene.grainShader.setUniform("u_resolution", [target.width, target.height]);
  scene.grainShader.setUniform("u_tile_size", state.tileSize);
  scene.grainShader.setUniform("u_grain_size", state.grainSize);
  scene.grainShader.setUniform("u_opacity", state.opacity);
  scene.grainShader.setUniform("u_offset", [
    scene.elapsedTime * state.drift.x,
    scene.elapsedTime * state.drift.y,
  ]);
  gl.enable(gl.BLEND);
  gl.blendEquation(gl.FUNC_ADD);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  target.rect(0, 0, target.width, target.height);
  gl.depthMask(true);
  target.resetShader();
  target.pop();
}
