export function cssMatrix3dForQuad(width, height, normalizedQuad) {
  const w = Math.max(1, Number(width) || 1);
  const h = Math.max(1, Number(height) || 1);
  const targets = normalizedQuad.map(([x, y]) => [x * w, y * h]);
  const sources = [[0, 0], [w, 0], [w, h], [0, h]];
  const matrix = [];
  const values = [];

  for (let i = 0; i < 4; i++) {
    const [x, y] = sources[i];
    const [u, v] = targets[i];
    matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); values.push(u);
    matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y]); values.push(v);
  }

  const [a, b, c, d, e, f, g, i] = solve(matrix, values);
  const result = [a, d, 0, g, b, e, 0, i, 0, 0, 1, 0, c, f, 0, 1];
  return `matrix3d(${result.map(clean).join(",")})`;
}

function solve(input, values) {
  const n = values.length;
  const a = input.map((row, index) => [...row, values[index]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    if (Math.abs(a[pivot][col]) < 1e-12) throw new Error("Projection surface is degenerate");
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const divisor = a[col][col];
    for (let j = col; j <= n; j++) a[col][j] /= divisor;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = a[row][col];
      for (let j = col; j <= n; j++) a[row][j] -= factor * a[col][j];
    }
  }
  return a.map((row) => row[n]);
}

function clean(value) {
  return Math.abs(value) < 1e-12 ? 0 : Number(value.toFixed(12));
}
