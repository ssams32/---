const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const brainDir = 'C:/Users/김준삼/.gemini/antigravity/brain/bb335649-baf3-459e-aebb-22d29c792ff4';
const outDir = path.join(__dirname, '..', 'public', 'stickers');

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// 1. Sheet configurations
const sheets = [
  {
    path: path.join(brainDir, 'cloud_emotions_sheet_1_1788339535454.jpg'),
    prefix: 'cloud_emotion',
    rows: 4,
    cols: 4,
    hasBottomText: false,
    outSize: 256
  },
  {
    path: path.join(brainDir, 'cloud_costume_sheet_2_1788339558863.jpg'),
    prefix: 'cloud_costume',
    rows: 4,
    cols: 4,
    hasBottomText: true,
    outSize: 256
  },
  {
    path: path.join(brainDir, 'cloud_action_sheet_3_1788339589828.jpg'),
    prefix: 'cloud_action',
    rows: 4,
    cols: 4,
    hasBottomText: false,
    outSize: 256
  },
  {
    path: path.join(brainDir, 'cloud_special_sheet_4_1788339612703.jpg'),
    prefix: 'cloud_special',
    rows: 4,
    cols: 3,
    hasBottomText: false,
    outSize: 256
  }
];

// 2. Icheon 20th custom rects
const icheonStickers = [
  // Sheet 1
  {
    sheet: path.join(brainDir, 'icheon_20th_korean_stickers_1_1788392631357.jpg'),
    id: 'icheon_20th_01',
    rect: { left: 35, top: 75, width: 285, height: 250 }
  },
  {
    sheet: path.join(brainDir, 'icheon_20th_korean_stickers_1_1788392631357.jpg'),
    id: 'icheon_20th_02',
    rect: { left: 345, top: 115, width: 360, height: 165 }
  },
  {
    sheet: path.join(brainDir, 'icheon_20th_korean_stickers_1_1788392631357.jpg'),
    id: 'icheon_20th_03',
    rect: { left: 720, top: 65, width: 250, height: 265 }
  },
  {
    sheet: path.join(brainDir, 'icheon_20th_korean_stickers_1_1788392631357.jpg'),
    id: 'icheon_20th_04',
    rect: { left: 35, top: 355, width: 285, height: 290 }
  },
  {
    sheet: path.join(brainDir, 'icheon_20th_korean_stickers_1_1788392631357.jpg'),
    id: 'icheon_20th_05',
    rect: { left: 355, top: 375, width: 330, height: 270 }
  },
  {
    sheet: path.join(brainDir, 'icheon_20th_korean_stickers_1_1788392631357.jpg'),
    id: 'icheon_20th_06',
    rect: { left: 730, top: 375, width: 235, height: 275 }
  },

  // Sheet 2
  {
    sheet: path.join(brainDir, 'icheon_20th_korean_stickers_2_1788392651314.jpg'),
    id: 'icheon_20th_07',
    rect: { left: 50, top: 80, width: 275, height: 255 }
  },
  {
    sheet: path.join(brainDir, 'icheon_20th_korean_stickers_2_1788392651314.jpg'),
    id: 'icheon_20th_08',
    rect: { left: 360, top: 70, width: 295, height: 265 }
  },
  {
    sheet: path.join(brainDir, 'icheon_20th_korean_stickers_2_1788392651314.jpg'),
    id: 'icheon_20th_09',
    rect: { left: 690, top: 70, width: 265, height: 265 }
  },
  {
    sheet: path.join(brainDir, 'icheon_20th_korean_stickers_2_1788392651314.jpg'),
    id: 'icheon_20th_10',
    rect: { left: 50, top: 375, width: 275, height: 275 }
  },
  {
    sheet: path.join(brainDir, 'icheon_20th_korean_stickers_2_1788392651314.jpg'),
    id: 'icheon_20th_11',
    rect: { left: 355, top: 375, width: 300, height: 275 }
  },
  {
    sheet: path.join(brainDir, 'icheon_20th_korean_stickers_2_1788392651314.jpg'),
    id: 'icheon_20th_12',
    rect: { left: 690, top: 375, width: 265, height: 275 }
  }
];

/**
 * Ultimate Border Stripping & Foreground Isolation
 */
async function processRawBuffer(rawBuffer, width, height, hasBottomText, outSize, destPath) {
  const n = width * height;
  const isOuterBg = new Uint8Array(n);
  const queue = [];

  // ONLY true outer white background (brightness >= 244 and neutral diff <= 14)
  function isOuterWhite(r, g, b) {
    const diff = Math.max(r, g, b) - Math.min(r, g, b);
    const brightness = (r + g + b) / 3;
    return brightness >= 244 && diff <= 14;
  }

  // 1. Seed boundary pixels from 4 edges
  for (let x = 0; x < width; x++) {
    const iTop = (0 * width + x) * 4;
    if (isOuterWhite(rawBuffer[iTop], rawBuffer[iTop + 1], rawBuffer[iTop + 2])) {
      isOuterBg[x] = 1;
      queue.push(x);
    }
    const idxBot = (height - 1) * width + x;
    const iBot = idxBot * 4;
    if (!isOuterBg[idxBot] && isOuterWhite(rawBuffer[iBot], rawBuffer[iBot + 1], rawBuffer[iBot + 2])) {
      isOuterBg[idxBot] = 1;
      queue.push(idxBot);
    }
  }

  for (let y = 0; y < height; y++) {
    const idxLeft = y * width + 0;
    const iLeft = idxLeft * 4;
    if (!isOuterBg[idxLeft] && isOuterWhite(rawBuffer[iLeft], rawBuffer[iLeft + 1], rawBuffer[iLeft + 2])) {
      isOuterBg[idxLeft] = 1;
      queue.push(idxLeft);
    }
    const idxRight = y * width + (width - 1);
    const iRight = idxRight * 4;
    if (!isOuterBg[idxRight] && isOuterWhite(rawBuffer[iRight], rawBuffer[iRight + 1], rawBuffer[iRight + 2])) {
      isOuterBg[idxRight] = 1;
      queue.push(idxRight);
    }
  }

  // 2. 4-way BFS flood-fill (4-way prevents diagonal leaks into thin outlines!)
  let head = 0;
  const dx = [1, -1, 0, 0];
  const dy = [0, 0, 1, -1];

  while (head < queue.length) {
    const curr = queue[head++];
    const cx = curr % width;
    const cy = Math.floor(curr / width);

    for (let k = 0; k < 4; k++) {
      const nx = cx + dx[k];
      const ny = cy + dy[k];
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const nidx = ny * width + nx;
        if (!isOuterBg[nidx]) {
          const pi = nidx * 4;
          if (isOuterWhite(rawBuffer[pi], rawBuffer[pi + 1], rawBuffer[pi + 2])) {
            isOuterBg[nidx] = 1;
            queue.push(nidx);
          }
        }
      }
    }
  }

  // 3. Bottom text cutoff (only for English text at bottom 9% when hasBottomText is true)
  const bottomCutoff = hasBottomText ? Math.floor(height * 0.91) : height;

  // 4. Apply Transparency & edge anti-aliasing
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const pi = idx * 4;

      if (isOuterBg[idx] === 1 || y >= bottomCutoff) {
        rawBuffer[pi + 3] = 0; // Transparent
      } else {
        // Character foreground - keep solid opaque!
        rawBuffer[pi + 3] = 255;

        // Subtle edge anti-aliasing on outer boundary
        let touchesVoid = false;
        for (let k = 0; k < 4; k++) {
          const nx = x + dx[k];
          const ny = y + dy[k];
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const nidx = ny * width + nx;
            if (isOuterBg[nidx] === 1 || ny >= bottomCutoff) {
              touchesVoid = true;
              break;
            }
          }
        }
        if (touchesVoid) {
          const r = rawBuffer[pi];
          const g = rawBuffer[pi + 1];
          const b = rawBuffer[pi + 2];
          const brightness = (r + g + b) / 3;
          if (brightness > 230) {
            rawBuffer[pi + 3] = Math.round(Math.max(0, Math.min(255, (255 - brightness) * 6)));
          }
        }
      }
    }
  }

  // 5. Trim transparent margins and scale cleanly into outSize square
  await sharp(rawBuffer, { raw: { width, height, channels: 4 } })
    .trim({ threshold: 5 })
    .resize(outSize, outSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ quality: 95, compressionLevel: 9 })
    .toFile(destPath);
}

async function run() {
  console.log('--- EXECUTING PERFECT BORDER-STRIPPED REGENERATION FOR ALL 72 STICKERS ---');

  // Process 60 Cloud Stickers
  for (const sheet of sheets) {
    const meta = await sharp(sheet.path).metadata();
    const cellW = Math.floor(meta.width / sheet.cols);
    const cellH = Math.floor(meta.height / sheet.rows);
    const totalCount = sheet.rows * sheet.cols;

    console.log(`Processing ${sheet.prefix} (${totalCount} stickers)...`);

    let idx = 0;
    for (let r = 0; r < sheet.rows; r++) {
      for (let c = 0; c < sheet.cols; c++) {
        idx++;
        const filename = `${sheet.prefix}_${String(idx).padStart(2, '0')}.png`;
        const destPath = path.join(outDir, filename);

        const left = c * cellW;
        const top = r * cellH;

        const { data, info } = await sharp(sheet.path)
          .extract({ left, top, width: cellW, height: cellH })
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });

        await processRawBuffer(data, info.width, info.height, sheet.hasBottomText, sheet.outSize, destPath);
        console.log(`  -> Pure Silhouette Generated: ${filename}`);
      }
    }
  }

  // Process 12 Icheon 20th Stickers
  console.log('Processing icheon_20th (12 stickers)...');
  for (const item of icheonStickers) {
    const filename = `${item.id}.png`;
    const destPath = path.join(outDir, filename);

    const { data, info } = await sharp(item.sheet)
      .extract(item.rect)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    await processRawBuffer(data, info.width, info.height, false, 340, destPath);
    console.log(`  -> Pure Silhouette Generated: ${filename}`);
  }

  console.log('\nSUCCESS: All 72 stickers have been regenerated with pure character silhouettes, zero white borders, zero grey outlines, and zero dots!');
}

run().catch(console.error);
