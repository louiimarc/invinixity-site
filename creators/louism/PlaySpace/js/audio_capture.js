inout.audio.setup = function () {
  inout.audio.fft = new p5.FFT(0.25, 64);
  inout.audio.spectrum.texture = createImage(8, 8);
};

inout.audio.update = function () {
  inout.audio.spectrum.numbers = inout.audio.fft.analyze();

  //    SPECTRUM TEXTURE 8x8
  inout.audio.spectrum.texture.loadPixels();
  for (let i = 0; i < 64 * 4; i += 4) {
    let v = inout.audio.spectrum.numbers[i / 4] * 0.5;
    inout.audio.spectrum.texture.pixels[i] = v;
    inout.audio.spectrum.texture.pixels[i + 1] = v;
    inout.audio.spectrum.texture.pixels[i + 2] = v;
    inout.audio.spectrum.texture.pixels[i + 3] = 255;
  }
  inout.audio.spectrum.texture.updatePixels();
};
