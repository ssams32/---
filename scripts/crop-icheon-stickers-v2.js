const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'public', 'stickers');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const sheet1Path = 'C:/Users/김준삼/.gemini/antigravity/brain/bb335649-baf3-459e-aebb-22d29c792ff4/icheon_20th_korean_stickers_1_1788392631357.jpg';
const sheet2Path = 'C:/Users/김준삼/.gemini/antigravity/brain/bb335649-baf3-459e-aebb-22d29c792ff4/icheon_20th_korean_stickers_2_1788392651314.jpg';

const stickers = [
  // Sheet 1 (6 items)
  {
    sheet: sheet1Path,
    id: 'icheon_20th_01',
    label: '이천센터 20주년 엠블럼',
    rect: { left: 30, top: 65, width: 295, height: 265 }
  },
  {
    sheet: sheet1Path,
    id: 'icheon_20th_02',
    label: '함께한 20년 늘 곁에 리본',
    rect: { left: 345, top: 110, width: 360, height: 175 }
  },
  {
    sheet: sheet1Path,
    id: 'icheon_20th_03',
    label: '20주년 축하 2단 케이크',
    rect: { left: 720, top: 55, width: 250, height: 280 }
  },
  {
    sheet: sheet1Path,
    id: 'icheon_20th_04',
    label: '20th 축하해 고깔 구름이',
    rect: { left: 30, top: 345, width: 295, height: 305 }
  },
  {
    sheet: sheet1Path,
    id: 'icheon_20th_05',
    label: '20주년 최고 엄지척 구름이',
    rect: { left: 350, top: 365, width: 340, height: 285 }
  },
  {
    sheet: sheet1Path,
    id: 'icheon_20th_06',
    label: '20th 이천센터 골든 트로피',
    rect: { left: 725, top: 365, width: 245, height: 290 }
  },

  // Sheet 2 (6 items)
  {
    sheet: sheet2Path,
    id: 'icheon_20th_07',
    label: '마음건강 20년 핑크 하트',
    rect: { left: 45, top: 70, width: 285, height: 270 }
  },
  {
    sheet: sheet2Path,
    id: 'icheon_20th_08',
    label: '20 숫자 하트풍선 구름이',
    rect: { left: 355, top: 60, width: 305, height: 280 }
  },
  {
    sheet: sheet2Path,
    id: 'icheon_20th_09',
    label: '20th 축하 파티 폭죽',
    rect: { left: 680, top: 60, width: 280, height: 280 }
  },
  {
    sheet: sheet2Path,
    id: 'icheon_20th_10',
    label: '꽃다발 & 20th 메달 구름이',
    rect: { left: 35, top: 370, width: 310, height: 260 }
  },
  {
    sheet: sheet2Path,
    id: 'icheon_20th_11',
    label: '20년 축하해요 손하트 구름이',
    rect: { left: 350, top: 365, width: 295, height: 265 }
  },
  {
    sheet: sheet2Path,
    id: 'icheon_20th_12',
    label: '20th 선물상자 구름이',
    rect: { left: 665, top: 380, width: 305, height: 250 }
  }
];

async function run() {
  for (const item of stickers) {
    const filename = `${item.id}.png`;
    const outPath = path.join(outDir, filename);

    await sharp(item.sheet)
      .extract(item.rect)
      .resize(340, 340, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png({ quality: 95 })
      .toFile(outPath);

    console.log(`Saved without any cutoff: ${filename} (${item.label})`);
  }
  console.log('All 12 refined Icheon 20th Anniversary stickers successfully generated!');
}

run().catch(console.error);
