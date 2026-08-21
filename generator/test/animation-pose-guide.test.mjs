import test from "node:test";
import assert from "node:assert/strict";

globalThis.ImageData ??= class ImageData {
  constructor(dataOrWidth, widthOrHeight, maybeHeight) {
    if (typeof dataOrWidth === "number") { this.width = dataOrWidth; this.height = widthOrHeight; this.data = new Uint8ClampedArray(this.width * this.height * 4); }
    else { this.data = dataOrWidth; this.width = widthOrHeight; this.height = maybeHeight; }
  }
};

const { walkPoseGuide } = await import("../../animation-pose-guide.js");

const source = new ImageData(32, 40);
for (let y = 3; y < 38; y += 1) for (let x = 8; x < 24; x += 1) source.data.set([80 + x, 120 + y, 70, 255], (y * source.width + x) * 4);

test("walk pose guides are deterministic and alternate opposite half cycles", () => {
  const first = walkPoseGuide(source, 1, 8);
  const opposite = walkPoseGuide(source, 5, 8);
  assert.equal(first.width, source.width);
  assert.equal(first.height, source.height);
  assert.notDeepEqual([...first.data], [...opposite.data]);
  assert.deepEqual([...walkPoseGuide(source, 1, 8).data], [...first.data]);
});
