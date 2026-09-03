const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const stickersDir = path.join(__dirname, '..', 'public', 'stickers');

async function removeBackground(filePath) {
  const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const totalPixels = w * h;
  const bgMask = new Uint8Array(totalPixels);
  const queue = [];

  // Sample corner colors for dynamic adaptive background matching
  const cornerCoords = [
    [0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1],
    [Math.floor(w / 2), 0], [Math.floor(w / 2), h - 1],
    [0, Math.floor(h / 2)], [w - 1, Math.floor(h / 2)]
  ];
  const bgSamples = [];
  for (const [cx, cy] of cornerCoords) {
    const idx = (cy * w + cx) * 4;
    const a = data[idx + 3];
    if (a > 0) {
      bgSamples.push([data[idx], data[idx + 1], data[idx + 2]]);
    }
  }

  function isBgColor(r, g, b, a) {
    if (a === 0) return true;
    const maxVal = Math.max(r, g, b);
    const minVal = Math.min(r, g, b);
    // Generic bright background
    if (r >= 228 && g >= 228 && b >= 228 && (maxVal - minVal <= 24)) {
      return true;
    }
    // Match against any corner sample
    for (const [sr, sg, sb] of bgSamples) {
      const dist = Math.sqrt((r - sr) ** 2 + (g - sg) ** 2 + (b - sb) ** 2);
      if (dist < 26) return true;
    }
    return false;
  }

  // 1. Seed queue with border pixels matching background
  for (let x = 0; x < w; x++) {
    // Top
    const iTop = (0 * w + x) * 4;
    if (isBgColor(data[iTop], data[iTop + 1], data[iTop + 2], data[iTop + 3])) {
      bgMask[x] = 1;
      queue.push(x);
    }
    // Bottom
    const idxBot = (h - 1) * w + x;
    const iBot = idxBot * 4;
    if (!bgMask[idxBot] && isBgColor(data[iBot], data[iBot + 1], data[iBot + 2], data[iBot + 3])) {
      bgMask[idxBot] = 1;
      queue.push(idxBot);
    }
  }

  for (let y = 0; y < h; y++) {
    // Left
    const idxLeft = y * w + 0;
    const iLeft = idxLeft * 4;
    if (!bgMask[idxLeft] && isBgColor(data[iLeft], data[iLeft + 1], data[iLeft + 2], data[iLeft + 3])) {
      bgMask[idxLeft] = 1;
      queue.push(idxLeft);
    }
    // Right
    const idxRight = y * w + (w - 1);
    const iRight = idxRight * 4;
    if (!bgMask[idxRight] && isBgColor(data[iRight], data[iRight + 1], data[iRight + 2], data[iRight + 3])) {
      bgMask[idxRight] = 1;
      queue.push(idxRight);
    }
  }

  // 2. 8-direction BFS flood-fill outward background only
  let head = 0;
  const dx = [1, -1, 0, 0, 1, -1, 1, -1];
  const dy = [0, 0, 1, -1, 1, 1, -1, -1];

  while (head < queue.length) {
    const curr = queue[head++];
    const cx = curr % w;
    const cy = Math.floor(curr / w);

    for (let k = 0; k < 8; k++) {
      const nx = cx + dx[k];
      const ny = cy + dy[k];
      if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
        const nidx = ny * w + nx;
        if (!bgMask[nidx]) {
          const pi = nidx * 4;
          if (isBgColor(data[pi], data[pi + 1], data[pi + 2], data[pi + 3])) {
            bgMask[nidx] = 1;
            queue.push(nidx);
          }
        }
      }
    }
  }

  // 3. Apply alpha = 0 to outer background + soft defringe on 1-2px border
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const pi = idx * 4;
      if (bgMask[idx] === 1) {
        data[pi + 3] = 0;
      } else {
        // Foreground pixel - check if it touches background
        let touchesBg = false;
        for (let k = 0; k < 4; k++) {
          const nx = x + dx[k];
          const ny = y + dy[k];
          if (nx >= 0 && nx < w && ny >= 0 && ny < h && bgMask[ny * w + nx] === 1) {
            touchesBg = true;
            break;
          }
        }
        if (touchesBg) {
          const r = data[pi];
          const g = data[pi + 1];
          const b = data[pi + 2];
          const brightness = (r + g + b) / 3;
          // Smoothly ramp down alpha on bright halo edge pixels
          if (brightness > 218) {
            data[pi + 3] = Math.round(Math.max(0, Math.min(255, (255 - brightness) * 4.2)));
          }
        }
      }
    }
  }

  // Save back as clean transparent PNG
  const tempPath = filePath + '.tmp.png';
  await sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .png({ quality: 95, compressionLevel: 9 })
    .toFile(tempPath);

  fs.copyFileSync(tempPath, filePath);
  fs.unlinkSync(tempPath);

  return { total: totalPixels, bgCount: queue.length };
}

async function run() {
  const files = fs.readdirSync(stickersDir).filter((f) => f.endsWith('.png'));
  console.log(`Starting background removal for ${files.length} stickers...`);

  let count = 0;
  for (const file of files) {
    const filePath = path.join(stickersDir, file);
    const { total, bgCount } = await removeBackground(filePath);
    count++;
    const pct = ((bgCount / total) * 100).toFixed(1);
    console.log(`[${count}/${files.length}] Cleaned: ${file} (${pct}% background made transparent)`);
  }

  console.log('\nAll stickers successfully cleaned and transparentized!');
}

run().catch(console.error);
