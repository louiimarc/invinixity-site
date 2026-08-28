import test from "node:test";
import assert from "node:assert/strict";
import { cssMatrix3dForQuad } from "../public/common/homography.js";

test("identity projection surface produces an identity matrix", () => {
  const matrix = cssMatrix3dForQuad(1280, 720, [[0,0],[1,0],[1,1],[0,1]]);
  assert.equal(matrix, "matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)");
});

test("trapezoid projection matrix stays finite", () => {
  const matrix = cssMatrix3dForQuad(1280, 720, [[.1,.5],[.9,.5],[1,1],[0,1]]);
  assert.match(matrix, /^matrix3d\(/);
  assert.equal(matrix.includes("NaN"), false);
  assert.equal(matrix.includes("Infinity"), false);
  assert.notEqual(matrix, "matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)");
});
