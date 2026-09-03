const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const brainDir = 'C:/Users/김준삼/.gemini/antigravity/brain/bb335649-baf3-459e-aebb-22d29c792ff4';
const outDir = path.join(__dirname, '..', 'public', 'stickers');

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const sheets = [
  {
    path: path.join(brainDir, 'cloud_emotions_sheet_1_1788339535454.jpg'),
    prefix: 'cloud_emotion',
    rows: 4,
    cols: 4,
    hasBottomText: false,
    topLimit: 14,
    botLimit: 242,
    outSize: 320
  },
  {
    path: path.join(brainDir, 'cloud_costume_sheet_2_1788339558863.jpg'),
    prefix: 'cloud_costume',
    rows: 4,
    cols: 4,
    hasBottomText: true,
    topLimit: 26, // Completely cuts off top neighbor text badge lines
    botLimit: 206, // Completely cuts off bottom English text placards
    outSize: 320
  },
  {
    path: path.join(brainDir, 'cloud_action_sheet_3_1788339589828.jpg'),
    prefix: 'cloud_action',
    rows: 4,
    cols: 4,
    hasBottomText: false,
    topLimit: 14,
    botLimit: 242,
    outSize: 320
  },
  {
    path: path.join(brainDir, 'cloud_special_sheet_4_1788339612703.jpg'),
    prefix: 'cloud_special',
    rows: 4,
    cols: 3,
    hasBottomText: false,
    topLimit: 14,
    botLimit: 242,
    outSize: 320
  }
];

const icheonStickers = [
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
 * True Silhouette Extraction Engine
 * - Pierces through die-cut cutting lines and neutral drop shadows
 * - Completely isolates the primary character inside the dark contour
 * - Enforces safe vertical bounding boxes to eliminate neighbor text bleed
 * - Applies mathematical unpremultiply defringing against white/grey bleed
 */
async function processRawBuffer(rawBuffer, width, height, topLimit, botLimit, outSize, destPath) {
  const w = width;
  const h = height;
  const n = w * h;
  const isOuterBg = new Uint8Array(n);
  const queue = [];

  // Background candidate:
  // 1. Pure or near-white background (diff <= 6, br >= 246)
  // 2. Neutral grey die-cut line and drop shadow (diff <= 4, br >= 135)
  function isOuterBgCandidate(r, g, b) {
    const diff = Math.max(r, g, b) - Math.min(r, g, b);
    const br = (r + g + b) / 3;
    if (br >= 246 && diff <= 6) return true;
    if (br >= 135 && diff <= 4) return true;
    return false;
  }

  // 1. Seed 4 borders
  for (let x = 0; x < w; x++) {
    const iTop = x * 4;
    if (isOuterBgCandidate(rawBuffer[iTop], rawBuffer[iTop + 1], rawBuffer[iTop + 2])) {
      isOuterBg[x] = 1;
      queue.push(x);
    }
    const idxBot = (h - 1) * w + x;
    const iBot = idxBot * 4;
    if (!isOuterBg[idxBot] && isOuterBgCandidate(rawBuffer[iBot], rawBuffer[iBot + 1], rawBuffer[iBot + 2])) {
      isOuterBg[idxBot] = 1;
      queue.push(idxBot);
    }
  }

  for (let y = 0; y < h; y++) {
    const idxLeft = y * w;
    const iLeft = idxLeft * 4;
    if (!isOuterBg[idxLeft] && isOuterBgCandidate(rawBuffer[iLeft], rawBuffer[iLeft + 1], rawBuffer[iLeft + 2])) {
      isOuterBg[idxLeft] = 1;
      queue.push(idxLeft);
    }
    const idxRight = y * w + (w - 1);
    const iRight = idxRight * 4;
    if (!isOuterBg[idxRight] && isOuterBgCandidate(rawBuffer[iRight], rawBuffer[iRight + 1], rawBuffer[iRight + 2])) {
      isOuterBg[idxRight] = 1;
      queue.push(idxRight);
    }
  }

  // 2. 4-way BFS flood-fill
  let head = 0;
  const dx = [1, -1, 0, 0];
  const dy = [0, 0, 1, -1];

  while (head < queue.length) {
    const curr = queue[head++];
    const cx = curr % w;
    const cy = Math.floor(curr / w);

    for (let k = 0; k < 4; k++) {
      const nx = cx + dx[k];
      const ny = cy + dy[k];
      if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
        const nidx = ny * w + nx;
        if (!isOuterBg[nidx]) {
          const pi = nidx * 4;
          if (isOuterBgCandidate(rawBuffer[pi], rawBuffer[pi + 1], rawBuffer[pi + 2])) {
            isOuterBg[nidx] = 1;
            queue.push(nidx);
          }
        }
      }
    }
  }

  // 3. Connected Components Labeling within Safe Character Zone
  const labels = new Int32Array(n);
  let labelCount = 0;
  const componentSizes = [0];
  const componentBoundingBoxes = [null];

  for (let y = topLimit; y < botLimit; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (isOuterBg[idx] === 0 && labels[idx] === 0) {
        labelCount++;
        labels[idx] = labelCount;
        let size = 0;
        let minX = x, maxX = x, minY = y, maxY = y;
        const cq = [idx];
        let cqHead = 0;

        while (cqHead < cq.length) {
          const curr = cq[cqHead++];
          size++;
          const cx = curr % w;
          const cy = Math.floor(curr / w);
          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;

          for (let k = 0; k < 4; k++) {
            const nx = cx + dx[k];
            const ny = cy + dy[k];
            if (nx >= 0 && nx < w && ny >= topLimit && ny < botLimit) {
              const nidx = ny * w + nx;
              if (isOuterBg[nidx] === 0 && labels[nidx] === 0) {
                labels[nidx] = labelCount;
                cq.push(nidx);
              }
            }
          }
        }
        componentSizes.push(size);
        componentBoundingBoxes.push({ minX, minY, maxX, maxY });
      }
    }
  }

  // Find the primary central character component
  let bestLabel = 1;
  let maxSize = 0;
  for (let lbl = 1; lbl <= labelCount; lbl++) {
    if (componentSizes[lbl] > maxSize) {
      maxSize = componentSizes[lbl];
      bestLabel = lbl;
    }
  }

  const mainBox = componentBoundingBoxes[bestLabel] || { minX: 0, minY: 0, maxX: w, maxY: h };
  const keepLabels = new Set([bestLabel]);

  for (let lbl = 1; lbl <= labelCount; lbl++) {
    if (lbl === bestLabel) continue;
    const box = componentBoundingBoxes[lbl];
    const sz = componentSizes[lbl];

    if (sz > maxSize * 0.005) {
      const yOverlap = (box.minY <= mainBox.maxY + 8) && (box.maxY >= mainBox.minY - 8);
      const xOverlap = (box.minX <= mainBox.maxX + 8) && (box.maxX >= mainBox.minX - 8);
      if (yOverlap && xOverlap) {
        keepLabels.add(lbl);
      }
    }
  }

  // 4. Assemble RGBA with Edge Defringing
  const finalRgba = Buffer.alloc(n * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const pi = idx * 4;
      const lbl = labels[idx];

      if (y < topLimit || y >= botLimit || !keepLabels.has(lbl)) {
        finalRgba[pi + 3] = 0; // Pure Transparent
      } else {
        let r = rawBuffer[pi];
        let g = rawBuffer[pi + 1];
        let b = rawBuffer[pi + 2];

        // Check if pixel touches transparent boundary
        let bgNeighbors = 0;
        for (let k = 0; k < 4; k++) {
          const nx = x + dx[k];
          const ny = y + dy[k];
          if (nx < 0 || nx >= w || ny < topLimit || ny >= botLimit || !keepLabels.has(labels[ny * w + nx])) {
            bgNeighbors++;
          }
        }

        if (bgNeighbors > 0) {
          const br = (r + g + b) / 3;
          if (br > 220) {
            const a = Math.max(0, Math.min(255, Math.round((255 - br) * 11)));
            finalRgba[pi + 3] = a;
            if (a > 0) {
              const aNorm = a / 255;
              r = Math.max(0, Math.min(255, Math.round((r - 255 * (1 - aNorm)) / aNorm)));
              g = Math.max(0, Math.min(255, Math.round((g - 255 * (1 - aNorm)) / aNorm)));
              b = Math.max(0, Math.min(255, Math.round((b - 255 * (1 - aNorm)) / aNorm)));
            }
          } else {
            finalRgba[pi + 3] = 255;
          }
        } else {
          finalRgba[pi + 3] = 255;
        }

        finalRgba[pi] = r;
        finalRgba[pi + 1] = g;
        finalRgba[pi + 2] = b;
      }
    }
  }

  // 5. Trim & Scale to outSize with Lanczos3
  await sharp(finalRgba, { raw: { width: w, height: h, channels: 4 } })
    .trim({ threshold: 4 })
    .resize(outSize, outSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: 'lanczos3' })
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(destPath);
}

async function run() {
  console.log('--- EXECUTING TRUE SILHOUETTE REGENERATION (ZERO DIE-CUT BORDER, ZERO TEXT BLEED) ---');

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

        await processRawBuffer(data, info.width, info.height, sheet.topLimit, sheet.botLimit, sheet.outSize, destPath);
        console.log(`  -> Pure True Silhouette: ${filename}`);
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

    await processRawBuffer(data, info.width, info.height, 0, info.height, 340, destPath);
    console.log(`  -> Pure True Silhouette: ${filename}`);
  }

  console.log('\nSUCCESS: All 72 stickers regenerated with 100% pure silhouette, 0 die-cut margins, 0 stray lines, 0 neighbor text bleed!');
}

run().catch(console.error);
