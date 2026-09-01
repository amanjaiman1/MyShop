/**
 * Generates the PWA icon set from a single inline SVG.
 *
 * Run with `npx tsx scripts/generate-icons.ts`. The output PNGs are committed
 * so the app never depends on this script at build or runtime.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const OUT = path.resolve(import.meta.dirname, "../public/icons");
mkdirSync(OUT, { recursive: true });

// Aurelia mark: a champagne "A" monogram on the berry gradient, with a soft
// gold bloom — matches the app's brand.
function logoSvg(size: number, maskable: boolean): string {
  const pad = maskable ? size * 0.14 : size * 0.08;
  const r = maskable ? size * 0.001 : size * 0.22;
  const inner = size - pad * 2;
  return `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="berry" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#A72350"/>
      <stop offset="55%" stop-color="#7C1B3C"/>
      <stop offset="100%" stop-color="#5B2A4A"/>
    </linearGradient>
    <radialGradient id="bloom" cx="0.7" cy="0.25" r="0.8">
      <stop offset="0%" stop-color="#F3E3CA" stop-opacity="0.55"/>
      <stop offset="60%" stop-color="#F3E3CA" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${maskable ? 0 : r}" fill="#7C1B3C"/>
  <rect x="${pad}" y="${pad}" width="${inner}" height="${inner}" rx="${maskable ? size * 0.16 : r}" fill="url(#berry)"/>
  <rect x="${pad}" y="${pad}" width="${inner}" height="${inner}" rx="${maskable ? size * 0.16 : r}" fill="url(#bloom)"/>
  <text x="50%" y="53%" dominant-baseline="central" text-anchor="middle"
    font-family="Georgia, 'Times New Roman', serif" font-weight="600"
    font-size="${inner * 0.62}" fill="#FBF7F4" letter-spacing="-2">A</text>
</svg>`;
}

async function main(): Promise<void> {
  const targets = [
    { name: "icon-192.png", size: 192, maskable: false },
    { name: "icon-512.png", size: 512, maskable: false },
    { name: "icon-maskable-192.png", size: 192, maskable: true },
    { name: "icon-maskable-512.png", size: 512, maskable: true },
    { name: "apple-touch-icon.png", size: 180, maskable: false },
  ];

  for (const t of targets) {
    await sharp(Buffer.from(logoSvg(t.size, t.maskable)))
      .png()
      .toFile(path.join(OUT, t.name));
    console.log(`✓ ${t.name}`);
  }

  // Favicon at 48px.
  await sharp(Buffer.from(logoSvg(48, false)))
    .png()
    .toFile(path.resolve(import.meta.dirname, "../public/favicon.png"));
  console.log("✓ favicon.png");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
