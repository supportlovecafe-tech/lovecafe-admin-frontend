/**
 * iPad App Store Screenshot Resizer
 * Resizes screenshots to Apple's required iPad 13" dimensions:
 * Portrait:  2048 × 2732 px
 * Landscape: 2732 × 2048 px
 *
 * Usage: node resize_ipad_screenshots.js <input_folder> <output_folder>
 * Example: node resize_ipad_screenshots.js "C:\Users\anirb\Desktop\iPad Screenshots" "C:\Users\anirb\Desktop\iPad Screenshots Resized"
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Apple's required iPad 13" dimensions
const IPAD_PORTRAIT  = { width: 2048, height: 2732 };
const IPAD_LANDSCAPE = { width: 2732, height: 2048 };

async function resizeScreenshot(inputPath, outputPath) {
  const meta = await sharp(inputPath).metadata();
  const isLandscape = meta.width > meta.height;
  const target = isLandscape ? IPAD_LANDSCAPE : IPAD_PORTRAIT;

  console.log(`  Input:  ${meta.width}×${meta.height} (${isLandscape ? 'landscape' : 'portrait'})`);
  console.log(`  Output: ${target.width}×${target.height}`);

  await sharp(inputPath)
    .resize(target.width, target.height, {
      fit: 'contain',        // Scales to fill, adding black bars if aspect differs
      background: { r: 0, g: 0, b: 0, alpha: 1 }
    })
    .png({ quality: 100 })
    .toFile(outputPath);
}

async function main() {
  const inputDir  = process.argv[2];
  const outputDir = process.argv[3];

  if (!inputDir || !outputDir) {
    console.error('\n❌ Usage: node resize_ipad_screenshots.js <input_folder> <output_folder>');
    console.error('Example: node resize_ipad_screenshots.js "C:\\Users\\anirb\\Desktop\\iPadShots" "C:\\Users\\anirb\\Desktop\\iPadShots_Resized"\n');
    process.exit(1);
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`✅ Created output folder: ${outputDir}`);
  }

  const supported = ['.png', '.jpg', '.jpeg'];
  const files = fs.readdirSync(inputDir).filter(f => supported.includes(path.extname(f).toLowerCase()));

  if (files.length === 0) {
    console.error(`\n❌ No PNG/JPG images found in: ${inputDir}\n`);
    process.exit(1);
  }

  console.log(`\n📱 Processing ${files.length} screenshot(s) → iPad 13" format\n`);

  for (const file of files) {
    const inputPath  = path.join(inputDir, file);
    const outputName = path.basename(file, path.extname(file)) + '_ipad.png';
    const outputPath = path.join(outputDir, outputName);

    console.log(`🔄 ${file}`);
    try {
      await resizeScreenshot(inputPath, outputPath);
      console.log(`  ✅ Saved: ${outputName}\n`);
    } catch (err) {
      console.error(`  ❌ Failed: ${err.message}\n`);
    }
  }

  console.log('🎉 Done! Upload the images from the output folder to App Store Connect.');
  console.log(`   Output folder: ${outputDir}\n`);
}

main();
