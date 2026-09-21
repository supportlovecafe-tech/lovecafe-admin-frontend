const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const outDirs = [
  'C:/Users/anirb/OneDrive/Desktop/iPhone_Screenshots_Resized',
  'C:/Users/anirb/Downloads/iPhone_Screenshots_Resized'
];

outDirs.forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const items = [
  { src: 'C:/Users/anirb/Downloads/WhatsApp Image 2026-09-17 at 13.12.32.jpeg', name: '1_signin_iphone' },
  { src: 'C:/Users/anirb/Downloads/WhatsApp Image 2026-09-17 at 13.12.30.jpeg', name: '2_home_iphone' },
  { src: 'C:/Users/anirb/Downloads/WhatsApp Image 2026-09-17 at 13.12.29 (1).jpeg', name: '3_menu_iphone' },
  { src: 'C:/Users/anirb/Downloads/WhatsApp Image 2026-09-17 at 13.12.28.jpeg', name: '4_checkout_iphone' },
  { src: 'C:/Users/anirb/Downloads/WhatsApp Image 2026-09-17 at 13.12.29.jpeg', name: '5_screen_iphone' }
];

const sizes = [
  { w: 1284, h: 2778, suffix: '' },                // iPhone 6.5" Display standard
  { w: 1242, h: 2688, suffix: '_1242x2688' },      // iPhone 6.5" Display alternative
  { w: 1290, h: 2796, suffix: '_1290x2796' }       // iPhone 6.7" Display (Pro Max)
];

async function run() {
  for (const item of items) {
    if (!fs.existsSync(item.src)) {
      console.log('File not found:', item.src);
      continue;
    }

    for (const size of sizes) {
      for (const outDir of outDirs) {
        const outPng = path.join(outDir, item.name + size.suffix + '.png');
        await sharp(item.src)
          .resize(size.w, size.h, {
            fit: 'cover',
            kernel: sharp.kernel.lanczos3,
            position: 'center'
          })
          .removeAlpha()
          .png({ compressionLevel: 9 })
          .toFile(outPng);

        console.log('Generated:', outPng, `${size.w}x${size.h}`);
      }
    }
  }
  console.log('ALL IPHONE RESIZING COMPLETED SUCCESSFULLY');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
