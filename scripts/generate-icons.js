// scripts/generate-icons.js

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import png2icons from 'png2icons';

const SRC_SVG = path.resolve('public/promptly.svg');
const OUT_DIR = path.resolve('assets');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// 1) sizes to emit as PNG
const pngSizes = [16, 32, 48, 64, 128, 256, 512, 1024];

async function makePNGs() {
  await Promise.all(
    pngSizes.map((size) =>
      sharp(SRC_SVG)
        .resize(size, size)
        .png()
        .toFile(path.join(OUT_DIR, `icon-${size}.png`))
    )
  );
  console.log('✓ PNG files generated');
}

function makeICO() {
  const src = fs.readFileSync(path.join(OUT_DIR, 'icon-256.png'));
  const buf = png2icons.createICO(src, png2icons.BICUBIC, false, [16, 32, 48, 64, 128, 256]);
  fs.writeFileSync(path.join(OUT_DIR, 'icon.ico'), buf);
  console.log('✓ icon.ico generated');
}

function makeICNS() {
  const src = fs.readFileSync(path.join(OUT_DIR, 'icon-512.png'));
  const buf = png2icons.createICNS(src, png2icons.BICUBIC, false, [16, 32, 64, 128, 256, 512, 1024]);
  fs.writeFileSync(path.join(OUT_DIR, 'icon.icns'), buf);
  console.log('✓ icon.icns generated');
}

async function run() {
  await makePNGs();
  makeICO();
  makeICNS();
  // copy a final PNG for Linux
  fs.copyFileSync(path.join(OUT_DIR, 'icon-512.png'), path.join(OUT_DIR, 'icon.png'));
  console.log('✓ icon.png generated');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
