const sharp = require('sharp');
async function validateAndNormalizeJpeg(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 1024) throw Object.assign(new Error('빈 이미지입니다.'),{status:400});
  if (buffer[0]!==0xff || buffer[1]!==0xd8 || buffer.at(-2)!==0xff || buffer.at(-1)!==0xd9) throw Object.assign(new Error('올바른 JPEG 파일이 아닙니다.'),{status:415});
  let meta; try { meta=await sharp(buffer,{failOn:'error',limitInputPixels:36_000_000}).metadata(); } catch { throw Object.assign(new Error('손상된 이미지입니다.'),{status:415}); }
  if (meta.format!=='jpeg' || !meta.width || !meta.height || meta.width<400 || meta.height<400 || meta.width>6000 || meta.height>6000) throw Object.assign(new Error('지원하지 않는 이미지 크기입니다.'),{status:422});
  const output=await sharp(buffer,{failOn:'error',limitInputPixels:36_000_000}).rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).flatten({background:'#fff'}).jpeg({quality:88,mozjpeg:true}).toBuffer();
  return output;
}
async function validateAndNormalizeBackground(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 1024) throw Object.assign(new Error('빈 이미지입니다.'),{status:400});
  let meta; try { meta=await sharp(buffer,{failOn:'error',limitInputPixels:50_000_000}).metadata(); } catch { throw Object.assign(new Error('손상되었거나 지원하지 않는 이미지 포맷입니다.'),{status:415}); }
  if (!['jpeg','png','webp'].includes(meta.format) || !meta.width || !meta.height || meta.width<300 || meta.height<300 || meta.width>8000 || meta.height>8000) {
    throw Object.assign(new Error('지원하지 않는 이미지 크기 또는 형식입니다. (JPEG/PNG, 최소 300x300, 최대 8000x8000)'),{status:422});
  }
  const hasAlpha = meta.hasAlpha && meta.format === 'png';
  let pipeline = sharp(buffer,{failOn:'error',limitInputPixels:50_000_000}).rotate().resize({width:2400,height:2840,fit:'inside',withoutEnlargement:true});
  if (hasAlpha) {
    return { buffer: await pipeline.png({quality:90,compressionLevel:8}).toBuffer(), format: 'png', width: meta.width, height: meta.height };
  } else {
    return { buffer: await pipeline.flatten({background:'#ffffff'}).jpeg({quality:90,mozjpeg:true}).toBuffer(), format: 'jpeg', width: meta.width, height: meta.height };
  }
}
module.exports={validateAndNormalizeJpeg,validateAndNormalizeBackground};
