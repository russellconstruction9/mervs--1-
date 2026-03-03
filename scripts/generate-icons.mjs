/**
 * PWA Icon Generator
 * Converts icon.svg into all required PNG sizes for manifest.json + iOS.
 *
 * Usage:
 *   npm install  (installs sharp devDependency)
 *   npm run icons
 *
 * Output files (in project root, served as static assets):
 *   icon-192.png         — standard 192×192 (manifest + Android)
 *   icon-512.png         — standard 512×512 (manifest + splash)
 *   icon-maskable-192.png — 192×192 with padding for maskable safe zone
 *   apple-touch-icon.png  — 180×180 (iOS home screen)
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SVG_PATH = resolve(ROOT, 'icon.svg');

const svgBuffer = readFileSync(SVG_PATH);

// Brand orange from the app theme
const BRAND_BG = { r: 234, g: 88, b: 12, alpha: 1 }; // #ea580c

async function generate() {
  console.log('Generating PWA icons from icon.svg...');

  // 1. Standard 192×192
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(resolve(ROOT, 'icon-192.png'));
  console.log('  ✓ icon-192.png');

  // 2. Standard 512×512
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(resolve(ROOT, 'icon-512.png'));
  console.log('  ✓ icon-512.png');

  // 3. Maskable 192×192 — add ~10% padding on each side (safe zone = 80% of icon area)
  //    Safe zone: center 80%, so each side gets 10% padding = 192 * 0.10 ≈ 19px
  const MASKABLE_SIZE = 192;
  const INNER_SIZE = Math.round(MASKABLE_SIZE * 0.8); // 153px content area
  const PADDING = Math.round((MASKABLE_SIZE - INNER_SIZE) / 2); // ~19px each side

  const innerIcon = await sharp(svgBuffer)
    .resize(INNER_SIZE, INNER_SIZE)
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: MASKABLE_SIZE,
      height: MASKABLE_SIZE,
      channels: 4,
      background: BRAND_BG,
    }
  })
    .composite([{ input: innerIcon, top: PADDING, left: PADDING }])
    .png()
    .toFile(resolve(ROOT, 'icon-maskable-192.png'));
  console.log('  ✓ icon-maskable-192.png (maskable with safe zone padding)');

  // 4. Apple Touch Icon 180×180 (iOS requires PNG, no transparency)
  await sharp({
    create: {
      width: 180,
      height: 180,
      channels: 4,
      background: BRAND_BG,
    }
  })
    .composite([{
      input: await sharp(svgBuffer).resize(140, 140).png().toBuffer(),
      top: 20, left: 20
    }])
    .png()
    .toFile(resolve(ROOT, 'apple-touch-icon.png'));
  console.log('  ✓ apple-touch-icon.png (180×180 for iOS)');

  console.log('\nDone! All icons generated in project root.');
  console.log('Commit these PNG files to source control so they are included in the build.');
}

generate().catch(err => {
  console.error('Icon generation failed:', err.message);
  process.exit(1);
});
