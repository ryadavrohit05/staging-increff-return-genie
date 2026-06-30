/**
 * Generate the app icon set from the company wordmark (logo.png at repo root).
 *
 * The wordmark is wide (~3.3:1), so:
 *  - the full wordmark is used as-is in UI headers / login screens, and
 *  - the left circular logomark is cropped + padded into a SQUARE for the
 *    Windows app icon (.ico), the 1024px PNG icon, and the web favicons.
 *
 * Re-run after replacing logo.png:  node scripts/gen-icons.mjs
 */
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { writeFile, mkdir, copyFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'logo.png');

// Fraction of the wordmark width occupied by the circular logomark on the left.
const MARK_FRACTION = 0.31;
const CANVAS = 1024;
const PAD = 70; // transparent breathing room around the mark

async function out(p) {
  await mkdir(dirname(p), { recursive: true });
  return p;
}

async function buildSquareMark(size) {
  const meta = await sharp(SRC).metadata();
  const cropW = Math.round((meta.width ?? 0) * MARK_FRACTION);
  const inner = size - PAD * 2 * (size / CANVAS);
  // Crop the logomark, trim transparent surroundings, fit into a transparent square.
  const mark = await sharp(SRC)
    .extract({ left: 0, top: 0, width: cropW, height: meta.height ?? 0 })
    .trim()
    .resize(Math.round(inner), Math.round(inner), {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: mark, gravity: 'center' }])
    .png()
    .toBuffer();
}

async function main() {
  // 1) Square PNG icon (1024) for electron-builder + the source-of-truth.
  const icon1024 = await buildSquareMark(CANVAS);
  await writeFile(await out(join(ROOT, 'apps/desktop/resources/icon.png')), icon1024);

  // 2) Multi-size .ico for Windows app / installer / tray.
  const icoSizes = [256, 128, 64, 48, 32, 16];
  const icoBuffers = await Promise.all(icoSizes.map((s) => buildSquareMark(s)));
  const ico = await pngToIco(icoBuffers);
  await writeFile(await out(join(ROOT, 'apps/desktop/resources/icon.ico')), ico);

  // 3) Favicons (square logomark) for both web/renderer surfaces.
  const favicon = await buildSquareMark(256);
  await writeFile(await out(join(ROOT, 'apps/desktop/src/renderer/public/favicon.png')), favicon);
  await writeFile(await out(join(ROOT, 'apps/admin/public/favicon.png')), favicon);

  // 4) Full wordmark, copied verbatim for in-app headers / login screens.
  await copyFile(SRC, await out(join(ROOT, 'apps/desktop/src/renderer/assets/logo.png')));
  await copyFile(SRC, await out(join(ROOT, 'apps/admin/src/assets/logo.png')));

  console.log('Icons generated:');
  console.log('  apps/desktop/resources/icon.png  (1024 square logomark)');
  console.log('  apps/desktop/resources/icon.ico  (256/128/64/48/32/16)');
  console.log('  apps/{desktop/src/renderer,admin}/public/favicon.png');
  console.log('  apps/{desktop/src/renderer,admin}/(src/)assets/logo.png  (full wordmark)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
