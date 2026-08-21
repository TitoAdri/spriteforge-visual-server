import sharp from "sharp";

const MAX_EXPORT_BYTES = 20 * 1024 * 1024;

function delays(metadata, pages) {
  const supplied = Array.isArray(metadata.delay) ? metadata.delay : [];
  return Array.from({ length: pages }, (_, index) => {
    const value = Number(supplied[index] || supplied[0] || 100);
    return Number.isFinite(value) && value >= 20 && value <= 10_000 ? Math.round(value) : 100;
  });
}

async function animationInfo(bytes) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_EXPORT_BYTES) throw new Error("Invalid animation export source");
  const metadata = await sharp(bytes, { animated: true, failOn: "none" }).metadata();
  const pages = Math.max(1, Number(metadata.pages || 1));
  const width = Number(metadata.width || 0);
  const height = Math.floor(Number(metadata.pageHeight || metadata.height || 0));
  if (!width || !height || pages > 64) throw new Error("Invalid animation dimensions");
  return { metadata, pages, width, height };
}

export async function exportAnimation(bytes, format) {
  const { metadata, pages, width, height } = await animationInfo(bytes);
  if (format === "gif") {
    const raw = await sharp(bytes, { animated: true, failOn: "none" }).ensureAlpha().raw().toBuffer();
    const output = await sharp(raw, { raw: { width, height: height * pages, channels: 4, pageHeight: height } })
      .gif({ loop: Number(metadata.loop || 0), delay: delays(metadata, pages), effort: 6 })
      .toBuffer();
    return { bytes: output, mimeType: "image/gif", filename: "spriteforge-animation.gif" };
  }
  if (format === "spritesheet") {
    const frames = await Promise.all(Array.from({ length: pages }, (_, page) => sharp(bytes, { page, pages: 1, failOn: "none" }).ensureAlpha().raw().toBuffer()));
    const output = await sharp({ create: { width: width * pages, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite(frames.map((input, index) => ({ input, raw: { width, height, channels: 4 }, left: index * width, top: 0 })))
      .png({ compressionLevel: 9, palette: false })
      .toBuffer();
    return { bytes: output, mimeType: "image/png", filename: "spriteforge-spritesheet.png" };
  }
  throw new Error("Unsupported animation export format");
}
