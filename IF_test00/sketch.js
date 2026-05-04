let points = [];
let pg;

let view = { x: 0, y: 0, w: 0, h: 0 };

let inputW, inputH, btnApply;
let radiusSlider;
let btnSave, btnClear;
let chkColor;

let newStroke = true;

function setup() {
  createCanvas(windowWidth, windowHeight);

  pg = createGraphics(2048, 2048);

  inputW = createInput('2048');
  inputH = createInput('2048');
  btnApply = createButton('Apply');

  radiusSlider = createSlider(0.5, 3.0, 1.0, 0.01);

  btnSave = createButton('Save');
  btnClear = createButton('Clear');

  let x = 20;
  let y = 20;
  let gap = 25;

  inputW.position(x, y);
  y += gap;
  inputH.position(x, y);
  btnApply.position(x + 175, y - gap / 2);

  y += gap;

  radiusSlider.position(x, y);
  radiusSlider.style('width', '100px');

  y += gap;

  chkColor = createCheckbox('Color', true);
  chkColor.position(x, y);

  y += gap;

  btnSave.position(x, y);
  btnClear.position(x + gap * 2, y);

  [inputW, inputH, btnApply, radiusSlider, chkColor, btnSave, btnClear].forEach(el => {
    el.style('z-index', '10');
  });

  btnApply.mousePressed(updateFramebuffer);
  btnSave.mousePressed(() => save(pg, 'artwork.png'));
  btnClear.mousePressed(() => points = []);

  textFont('monospace');
}

function draw() {
  drawCheckerboard();

  let sz = min(width / pg.width, height / pg.height);

  view.w = pg.width * sz;
  view.h = pg.height * sz;
  view.x = (width - view.w) * 0.5;
  view.y = (height - view.h) * 0.5;

  pg.clear();

  let rMul = radiusSlider.value();

  pg.noStroke();
  for (let p of points) {
    if (chkColor.checked()) {
      pg.fill(p.col);
    } else {
      pg.fill(0);
    }
    pg.circle(p.x, p.y, p.r * 10 * rMul);
  }

  image(pg, view.x, view.y, view.w, view.h);

  noFill();
  stroke(255);
  strokeWeight(2);
  rect(view.x, view.y, view.w, view.h);

  noStroke();
  fill(0, 120);
  rect(0, 0, width, view.y);
  rect(0, view.y + view.h, width, height);
  rect(0, view.y, view.x, view.h);
  rect(view.x + view.w, view.y, width, view.h);

  fill(255);
  noStroke();
  textSize(12);
}

function drawCheckerboard() {
  let size = 20;

  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      if ((x / size + y / size) % 2 === 0) fill(100);
      else fill(55);

      noStroke();
      rect(x, y, size, size);
    }
  }
}

function updateFramebuffer() {
  let w = int(inputW.value());
  let h = int(inputH.value());

  if (w > 0 && h > 0) {
    pg = createGraphics(w, h);
  }
}

function mousePressed() {
  newStroke = true;
}

function touchStarted() {
  newStroke = true;
  return false;
}

function mouseDragged() {
  if (
    mouseX < view.x || mouseX > view.x + view.w ||
    mouseY < view.y || mouseY > view.y + view.h
  ) return;

  let x = map(mouseX, view.x, view.x + view.w, 0, pg.width);
  let y = map(mouseY, view.y, view.y + view.h, 0, pg.height);

  if (newStroke) {
    addPoint(x, y);
    newStroke = false;
    return;
  }

  let last = points[points.length - 1];

  let d = dist(x, y, last.x, last.y);
  let step = 6;

  if (d > step) {
    let steps = floor(d / step);

    for (let i = 1; i <= steps; i++) {
      let t = i / steps;
      t = t * t * (3.0 - 2.0 * t);

      let ix = lerp(last.x, x, t);
      let iy = lerp(last.y, y, t);

      addPoint(ix, iy);
    }
  }
}

function addPoint(x, y) {
  let seed = x * 0.01 + y * 0.01;

  let col = color(
    noise(seed, 0) * 255,
    noise(seed, 100) * 255,
    noise(seed, 200) * 255,
    140
  );

  let r = noise(seed, 300) * 10 + 4;

  points.push({ x, y, col, r });

  if (points.length > 2000) points.shift();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}