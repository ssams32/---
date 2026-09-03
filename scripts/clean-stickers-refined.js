const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const stickersDir = path.join(__dirname, '..', 'public', 'stickers');

async function cleanStickerFile(filePath) {
  const filename = path.basename(filePath);
  const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const n = w * h;

  // 1. External background Flood Fill (Starts from image boundaries only)
  const isOuterBg = new Uint8Array(n);
  const queue = [];

  function isBgCandidate(r, g, b, a) {
    if (a < 20) return true;
    const diff = Math.max(r, g, b) - Math.min(r, g, b);
    return (r >= 222 && g >= 222 && b >= 222 && diff <= 28);
  }

  // Seed boundary pixels
  for (let x = 0; x < w; x++) {
    const iTop = (0 * w + x) * 4;
    if (isBgCandidate(data[iTop], data[iTop + 1], data[iTop + 2], data[iTop + 3])) {
      isOuterBg[x] = 1;
      queue.push(x);
    }
    const idxBot = (h - 1) * w + x;
    const iBot = idxBot * 4;
    if (!isOuterBg[idxBot] && isBgCandidate(data[iBot], data[iBot + 1], data[iBot + 2], data[iBot + 3])) {
      isOuterBg[idxBot] = 1;
      queue.push(idxBot);
    }
  }

  for (let y = 0; y < h; y++) {
    const idxLeft = y * w + 0;
    const iLeft = idxLeft * 4;
    if (!isOuterBg[idxLeft] && isBgCandidate(data[iLeft], data[iLeft + 1], data[iLeft + 2], data[iLeft + 3])) {
      isOuterBg[idxLeft] = 1;
      queue.push(idxLeft);
    }
    const idxRight = y * w + (w - 1);
    const iRight = idxRight * 4;
    if (!isOuterBg[idxRight] && isBgCandidate(data[iRight], data[iRight + 1], data[iRight + 2], data[iRight + 3])) {
      isOuterBg[idxRight] = 1;
      queue.push(idxRight);
    }
  }

  // 8-directional BFS flood fill
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
        if (!isOuterBg[nidx]) {
          const pi = nidx * 4;
          if (isBgCandidate(data[pi], data[pi + 1], data[pi + 2], data[pi + 3])) {
            isOuterBg[nidx] = 1;
            queue.push(nidx);
          }
        }
      }
    }
  }

  // 2. Connected Component Labeling on remaining foreground
  const labels = new Int32Array(n);
  let currentLabel = 0;
  const componentSizes = [0];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (isOuterBg[idx] === 0 && labels[idx] === 0) {
        currentLabel++;
        labels[idx] = currentLabel;
        let size = 0;
        const cq = [idx];
        let cqHead = 0;

        while (cqHead < cq.length) {
          const curr = cq[cqHead++];
          size++;
          const cx = curr % w;
          const cy = Math.floor(curr / w);

          for (let k = 0; k < 8; k++) {
            const nx = cx + dx[k];
            const ny = cy + dy[k];
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
              const nidx = ny * w + nx;
              if (isOuterBg[nidx] === 0 && labels[nidx] === 0) {
                labels[nidx] = currentLabel;
                cq.push(nidx);
              }
            }
          }
        }
        componentSizes.push(size);
      }
    }
  }

  // 3. Keep Main Component & Valid Central Decoratives
  let bestLabel = 1;
  let maxSize = 0;
  for (let lbl = 1; lbl <= currentLabel; lbl++) {
    if (componentSizes[lbl] > maxSize) {
      maxSize = componentSizes[lbl];
      bestLabel = lbl;
    }
  }

  const keepLabels = new Set([bestLabel]);
  for (let lbl = 1; lbl <= currentLabel; lbl++) {
    if (lbl === bestLabel) continue;
    // Keep decorative elements that are substantial (at least 2.5% of main character)
    if (componentSizes[lbl] > maxSize * 0.025) {
      keepLabels.add(lbl);
    }
  }

  // Specific rule for costume stickers: Remove English text label box at bottom
  const isCostume = filename.includes('costume');
  const bottomCutoff = isCostume ? Math.floor(h * 0.80) : h;

  // 4. Apply Transparency & Smooth Defringing
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const pi = idx * 4;

      if (isOuterBg[idx] === 1 || !keepLabels.has(labels[idx]) || y >= bottomCutoff) {
        data[pi + 3] = 0;
      } else {
        // Boundary check for soft defringing
        let touchesVoid = false;
        for (let k = 0; k < 4; k++) {
          const nx = x + dx[k];
          const ny = y + dy[k];
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            const nidx = ny * w + nx;
            if (isOuterBg[nidx] === 1 || !keepLabels.has(labels[nidx]) || ny >= bottomCutoff) {
              touchesVoid = true;
              break;
            }
          }
        }
        if (touchesVoid) {
          const r = data[pi];
          const g = data[pi + 1];
          const b = data[pi + 2];
          const brightness = (r + g + b) / 3;
          if (brightness > 218) {
            data[pi + 3] = Math.round(Math.max(0, Math.min(255, (255 - brightness) * 4.2)));
          }
        }
      }
    }
  }

  // 5. Trim transparent margins and resize smoothly back
  const tempPath = filePath + '.cleaned.png';
  await sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .trim({ threshold: 5 })
    .resize(w, h, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ quality: 95, compressionLevel: 9 })
    .toFile(tempPath);

  fs.copyFileSync(tempPath, filePath);
  fs.unlinkSync(tempPath);
}

async function run() {
  const files = fs.readdirSync(stickersDir).filter((f) => f.endsWith('.png'));
  console.log(`Starting refined cleaning for ${files.length} stickers...`);

  let count = 0;
  for (const file of files) {
    const filePath = path.join(stickersDir, file);
    await cleanStickerFile(filePath);
    count++;
    console.log(`[${count}/${files.length}] Refined: ${file}`);
  }

  console.log('\nAll 72 stickers have been refined, English texts removed, and top marks erased!');
}

run().catch(console.error);
