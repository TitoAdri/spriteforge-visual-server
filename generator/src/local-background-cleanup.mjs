import sharp from "sharp";

const MATTE = [255, 0, 255];
const candidate = (red, green, blue) => {
  const distance = (red - MATTE[0]) ** 2 + (green - MATTE[1]) ** 2 + (blue - MATTE[2]) ** 2;
  // This deliberately requires bright magenta. Dark or muted purple pixels in the
  // character are never candidates, even if they touch the exterior silhouette.
  return distance <= 17_000 && red >= 145 && blue >= 125 && green <= 125 && red + blue - (green * 2) >= 190;
};
const coreMatte = (red, green, blue) => {
  const distance = (red - MATTE[0]) ** 2 + (green - MATTE[1]) ** 2 + (blue - MATTE[2]) ** 2;
  // Pixel Engine flattens alpha onto this exact known colour. A core match is
  // removed even inside a closed gap (for example, inside a lantern handle).
  return distance <= 6_000 && red >= 190 && blue >= 190 && green <= 65;
};
const matteFringe = (red, green, blue) => {
  const magentaBias = ((red + blue) / 2) - green;
  const distance = (red - MATTE[0]) ** 2 + (green - MATTE[1]) ** 2 + (blue - MATTE[2]) ** 2;
  // Dark anti-aliased edge blends can be almost black but still retain a strong
  // magenta hue. This only runs from a verified transparent boundary, never in
  // the sprite interior, and replaces the colour from a nearby opaque pixel.
  return magentaBias >= 20 && red >= 28 && blue >= 28 && green <= 110 && distance <= 100_000;
};

function clearMatteFrame(data, width, height, offset) {
  const pixels = width * height;
  const connected = new Uint8Array(pixels);
  const queue = new Int32Array(pixels);
  let head = 0; let tail = 0;
  const enqueue = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = y * width + x;
    if (connected[index]) return;
    const pixel = offset + index * 4;
    if (!candidate(data[pixel], data[pixel + 1], data[pixel + 2])) return;
    connected[index] = 1; queue[tail++] = index;
  };
  for (let x = 0; x < width; x += 1) { enqueue(x, 0); enqueue(x, height - 1); }
  for (let y = 1; y < height - 1; y += 1) { enqueue(0, y); enqueue(width - 1, y); }
  while (head < tail) {
    const index = queue[head++]; const x = index % width; const y = Math.floor(index / width);
    enqueue(x - 1, y); enqueue(x + 1, y); enqueue(x, y - 1); enqueue(x, y + 1);
  }
  for (let index = 0; index < pixels; index += 1) {
    const pixel = offset + index * 4;
    if (connected[index] || coreMatte(data[pixel], data[pixel + 1], data[pixel + 2])) data[pixel + 3] = 0;
  }
  // The generator sometimes leaves small quantised islands of the matte inside
  // an otherwise opaque subject. Removing only short components preserves a
  // deliberately purple garment or accessory, which occupies a larger region.
  const inspected = new Uint8Array(pixels);
  const nearestOpaqueColour = (index) => {
    const x = index % width; const y = Math.floor(index / width);
    for (let radius = 1; radius <= 3; radius += 1) for (let dy = -radius; dy <= radius; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
      const nx = x + dx; const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const neighbor = ny * width + nx; const neighborPixel = offset + neighbor * 4;
      if (data[neighborPixel + 3] > 0 && !matteFringe(data[neighborPixel], data[neighborPixel + 1], data[neighborPixel + 2])) return neighborPixel;
    }
    return -1;
  };
  for (let start = 0; start < pixels; start += 1) {
    const startPixel = offset + start * 4;
    if (inspected[start] || data[startPixel + 3] === 0 || !matteFringe(data[startPixel], data[startPixel + 1], data[startPixel + 2])) continue;
    const members = []; const queue = [start]; inspected[start] = 1;
    while (queue.length) {
      const index = queue.pop(); members.push(index); const x = index % width; const y = Math.floor(index / width);
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dy) continue; const nx = x + dx; const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const neighbor = ny * width + nx; const neighborPixel = offset + neighbor * 4;
        if (!inspected[neighbor] && data[neighborPixel + 3] > 0 && matteFringe(data[neighborPixel], data[neighborPixel + 1], data[neighborPixel + 2])) { inspected[neighbor] = 1; queue.push(neighbor); }
      }
    }
    if (members.length > 20) continue;
    for (const index of members) { const pixel = offset + index * 4; const replacement = nearestOpaqueColour(index); if (replacement >= 0) { data[pixel] = data[replacement]; data[pixel + 1] = data[replacement + 1]; data[pixel + 2] = data[replacement + 2]; } else data[pixel + 3] = 0; }
  }
  // Remove only bright magenta fringe pixels adjacent to the proven background.
  // This avoids deleting deliberate purple details inside the sprite.
  // A matte blend can occupy two or three pixels. Repeating from the new alpha
  // boundary catches that chain without scanning or altering the sprite interior.
  for (let pass = 0; pass < 3; pass += 1) for (let y = 1; y < height - 1; y += 1) for (let x = 1; x < width - 1; x += 1) {
    const index = y * width + x; const pixel = offset + index * 4;
    if (data[pixel + 3] === 0) continue;
    const adjacentTransparent = data[offset + (index - 1) * 4 + 3] === 0 || data[offset + (index + 1) * 4 + 3] === 0 || data[offset + (index - width) * 4 + 3] === 0 || data[offset + (index + width) * 4 + 3] === 0;
    if (!adjacentTransparent || !matteFringe(data[pixel], data[pixel + 1], data[pixel + 2])) continue;
    let replacement = -1;
    for (let radius = 1; radius <= 2 && replacement < 0; radius += 1) for (let dy = -radius; dy <= radius && replacement < 0; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
      const neighbor = (y + dy) * width + x + dx; const neighborPixel = offset + neighbor * 4;
      if (data[neighborPixel + 3] > 0 && !matteFringe(data[neighborPixel], data[neighborPixel + 1], data[neighborPixel + 2])) replacement = neighborPixel;
    }
    if (replacement >= 0) { data[pixel] = data[replacement]; data[pixel + 1] = data[replacement + 1]; data[pixel + 2] = data[replacement + 2]; }
    else data[pixel + 3] = 0;
  }
}

export async function removeKnownMagentaMatte(bytes) {
  const input = sharp(bytes, { animated: true, failOn: "none" });
  const metadata = await input.metadata();
  const { data, info } = await input.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pageHeight = info.pageHeight || metadata.pageHeight || info.height;
  if (!Number.isInteger(pageHeight) || pageHeight < 1 || info.height % pageHeight !== 0) throw new Error("Animation frames could not be read safely.");
  const pages = info.height / pageHeight;
  const frameBytes = info.width * pageHeight * 4;
  for (let frame = 0; frame < pages; frame += 1) clearMatteFrame(data, info.width, pageHeight, frame * frameBytes);
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4, pageHeight } })
    .webp({ lossless: true, effort: 5, loop: metadata.loop || 0, delay: metadata.delay || Array(pages).fill(100), exact: true })
    .toBuffer();
}
