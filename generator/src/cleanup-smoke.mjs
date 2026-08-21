import fs from "node:fs/promises";
import { removeKnownMagentaMatte } from "./local-background-cleanup.mjs";

const source = "/data/assets/47g1niDNGqJS9inFpYTNbA/4beb4032-4ee5-4c78-8627-80fcdbbf0160/animation.webp";
const target = "/data/cleanup-test.webp";
const input = await fs.readFile(source);
const output = await removeKnownMagentaMatte(input);
await fs.writeFile(target, output, { mode: 0o600 });
const { default: sharp } = await import("sharp");
const metadata = await sharp(input, { animated: true }).metadata();
const pages = metadata.pages || 1;
const frameWidth = metadata.width;
const frameHeight = metadata.pageHeight || metadata.height;
const contactSheet = async (bytes, destination) => {
  const frames = await Promise.all(Array.from({ length: pages }, (_, page) => sharp(bytes, { page, pages: 1 }).png().toBuffer()));
  await sharp({ create: { width: frameWidth * pages, height: frameHeight, channels: 4, background: { r: 16, g: 20, b: 32, alpha: 1 } } })
    .composite(frames.map((frame, page) => ({ input: frame, left: page * frameWidth, top: 0 })))
    .png()
    .toFile(destination);
};
await contactSheet(input, "/data/cleanup-before.png");
await contactSheet(output, "/data/cleanup-after.png");
await sharp(output, { page: 0, pages: 1 }).resize({ width: frameWidth * 8, height: frameHeight * 8, kernel: "nearest" }).png().toFile("/data/cleanup-after-zoom.png");
await Promise.all(Array.from({ length: pages }, (_, page) => sharp(output, { page, pages: 1 }).resize({ width: frameWidth * 5, height: frameHeight * 5, kernel: "nearest" }).png().toFile(`/data/cleanup-frame-${page + 1}.png`)));
const suspects = [];
for (let page = 0; page < pages; page += 1) {
  const raw = await sharp(output, { page, pages: 1 }).ensureAlpha().raw().toBuffer();
  for (let i = 0; i < raw.length; i += 4) if (raw[i + 3] > 0) {
    const score = Math.min(raw[i], raw[i + 2]) - raw[i + 1];
    if (score > 0) suspects.push({ page: page + 1, x: (i / 4) % frameWidth, y: Math.floor(i / 4 / frameWidth), rgb: [raw[i], raw[i + 1], raw[i + 2]], score });
  }
}
suspects.sort((a, b) => b.score - a.score);
console.log(JSON.stringify({ input: input.length, output: output.length, pages, target, suspects: suspects.slice(0, 32) }));
