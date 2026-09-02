const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'public', 'stickers');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const sheets = [
  {
    path: 'C:/Users/김준삼/.gemini/antigravity/brain/bb335649-baf3-459e-aebb-22d29c792ff4/cloud_emotions_sheet_1_1788339535454.jpg',
    prefix: 'emotion',
    rows: 4,
    cols: 4,
    labels: [
      '미소', '하트눈', '윙크', '기쁨눈물',
      '선글라스', '수줍음', '놀람', '볼빵빵',
      '눈웃음', '수면모자', '불타는열정', '냠냠',
      '갸우뚱', '뽀뽀', '대폭소', '반짝이'
    ]
  },
  {
    path: 'C:/Users/김준삼/.gemini/antigravity/brain/bb335649-baf3-459e-aebb-22d29c792ff4/cloud_costume_sheet_2_1788339558863.jpg',
    prefix: 'costume',
    rows: 4,
    cols: 4,
    labels: [
      '파티고깔', '황금왕관', '학사모', '산타',
      '의사선생님', '요리사', '탐정', '화가',
      '운동선수', 'DJ헤드폰', '노랑우비', '꽃화관',
      '토끼귀', '마술사', '천사', '포근담요'
    ]
  },
  {
    path: 'C:/Users/김준삼/.gemini/antigravity/brain/bb335649-baf3-459e-aebb-22d29c792ff4/cloud_action_sheet_3_1788339589828.jpg',
    prefix: 'action',
    rows: 4,
    cols: 4,
    labels: [
      '큰하트', '최고야', '더블브이', '응원폼폼',
      '네잎클로버', '선물상자', '카메라찰칵', '따뜻한커피',
      '마음편지', '꽃다발', '풍선둥둥', '안녕손흔들기',
      '마이크노래', '금메달', '토닥토닥', '하트날리기'
    ]
  },
  {
    path: 'C:/Users/김준삼/.gemini/antigravity/brain/bb335649-baf3-459e-aebb-22d29c792ff4/cloud_special_sheet_4_1788339612703.jpg',
    prefix: 'special',
    rows: 4,
    cols: 3,
    labels: [
      '볼하트', '스파클러', '무지개라이딩',
      '요정날개', '팝콘냠냠', '셀카봉',
      '칭찬도장', '힐링독서', '우쿨렐레',
      '클로버핀', '반짝리본', '쿨쿨꿀잠'
    ]
  }
];

async function processSheet(sheet) {
  const meta = await sharp(sheet.path).metadata();
  const cellW = Math.floor(meta.width / sheet.cols);
  const cellH = Math.floor(meta.height / sheet.rows);

  let idx = 0;
  for (let r = 0; r < sheet.rows; r++) {
    for (let c = 0; c < sheet.cols; c++) {
      if (idx >= sheet.labels.length) break;
      const label = sheet.labels[idx];
      const filename = `cloud_${sheet.prefix}_${String(idx + 1).padStart(2, '0')}.png`;
      const outPath = path.join(outDir, filename);

      const left = c * cellW;
      const top = r * cellH;

      // Extract each sticker cell and convert to crisp PNG with white border trimmed
      await sharp(sheet.path)
        .extract({ left, top, width: cellW, height: cellH })
        .resize(256, 256, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
        .png({ quality: 90 })
        .toFile(outPath);

      console.log(`Generated: ${filename} (${label})`);
      idx++;
    }
  }
}

async function run() {
  for (const sheet of sheets) {
    await processSheet(sheet);
  }
  console.log('All 60 cloud stickers successfully generated and cropped!');
}

run().catch(console.error);
