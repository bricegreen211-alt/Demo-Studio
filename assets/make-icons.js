/*
 * Generate all application icons from assets/icon.svg:
 *   - extension/icons/icon{16,32,48,64,128}.png
 *   - apps/studio/renderer/favicon.png (32)
 *   - assets/icon.iconset/* + assets/icon.icns (macOS, via iconutil)
 * Run: node assets/make-icons.js
 */
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const SVG = path.join(__dirname, "icon.svg");

async function png(size, dest) {
  await sharp(SVG, { density: Math.max(72, (size / 1024) * 72 * 8) })
    .resize(size, size)
    .png()
    .toFile(dest);
  console.log("wrote", path.relative(ROOT, dest));
}

(async () => {
  // Extension icons
  const extDir = path.join(ROOT, "extension", "icons");
  fs.mkdirSync(extDir, { recursive: true });
  for (const s of [16, 32, 48, 64, 128]) {
    await png(s, path.join(extDir, "icon" + s + ".png"));
  }

  // Dashboard favicon
  await png(32, path.join(ROOT, "apps", "studio", "renderer", "favicon.png"));

  // macOS iconset -> icns
  const setDir = path.join(__dirname, "icon.iconset");
  fs.rmSync(setDir, { recursive: true, force: true });
  fs.mkdirSync(setDir);
  const macSizes = [16, 32, 64, 128, 256, 512, 1024];
  for (const s of macSizes) {
    if (s <= 512) await png(s, path.join(setDir, `icon_${s}x${s}.png`));
    if (s >= 32) await png(s, path.join(setDir, `icon_${s / 2}x${s / 2}@2x.png`));
  }
  try {
    execSync(`iconutil -c icns "${setDir}" -o "${path.join(__dirname, "icon.icns")}"`);
    console.log("wrote assets/icon.icns");
  } catch (e) {
    console.warn("iconutil failed (non-macOS?):", e.message);
  }

  // 512 png for Electron BrowserWindow icon on win/linux
  await png(512, path.join(__dirname, "icon-512.png"));
})();
