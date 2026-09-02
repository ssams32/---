const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const srcPath = 'C:/Users/김준삼/.gemini/antigravity/brain/bb335649-baf3-459e-aebb-22d29c792ff4/icheon_20th_anniversary_stickers_1788392323718.jpg';
const outDir = path.join(__dirname, '..', 'public', 'stickers');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const items = [
  { id: 'icheon_20th_01', label: '이천센터 20주년 엠블럼', rect: { left: 45, top: 40, width: 295, height: 280 } },
  { id: 'icheon_20th_02', label: '20주년 축하 케이크', rect: { left: 380, top: 40, width: 260, height: 280 } },
  { id: 'icheon_20th_03', label: '이천 도자기와 구름이', rect: { left: 670, top: 40, width: 295, height: 280 } },
  { id: 'icheon_20th_04', label: '이천 쌀밥과 구름이', rect: { left: 45, top: 325, width: 300, height: 270 } },
  { id: 'icheon_20th_05', label: '이천 햇사레 복숭아 구름이', rect: { left: 360, top: 330, width: 300, height: 265 } },
  { id: 'icheon_20th_06', label: '20th 골든 트로피', rect: { left: 680, top: 340, width: 265, height: 275 } },
  { id: 'icheon_20th_07', label: '20 숫자 하트풍선 구름이', rect: { left: 45, top: 590, width: 330, height: 350 } },
  { id: 'icheon_20th_08', label: '20th 축하 파티폭죽', rect: { left: 410, top: 575, width: 285, height: 265 } },
  { id: 'icheon_20th_09', label: '꽃다발 & 20th 금메달 구름이', rect: { left: 670, top: 645, width: 285, height: 295 } },
  { id: 'icheon_20th_10', label: '이천센터 20주년 리본배너', rect: { left: 320, top: 810, width: 380, height: 160 } }
];

async function run() {
  const meta = await sharp(srcPath).metadata();
  console.log(`Source sheet dimensions: ${meta.width}x${meta.height}`);

  for (const item of items) {
    const filename = `${item.id}.png`;
    const outPath = path.join(outDir, filename);

    // Crop, resize and save with crisp quality
    await sharp(srcPath)
      .extract(item.rect)
      .resize(320, 320, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png({ quality: 92 })
      .toFile(outPath);

    console.log(`Saved: ${filename} - ${item.label}`);
  }
  console.log('All 10 Icheon 20th Anniversary stickers successfully created!');
}

run().catch(console.error);
