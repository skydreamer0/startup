import { inflateSync } from 'node:zlib';

const crc32 = bytes => {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
};
export function validatePng(bytes) {
  const bad = () => { throw new Error('Missing or invalid expected PNG'); };
  if (!bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) bad();
  let offset = 8, header, ended = false;
  const data = [];
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) bad();
    const size = bytes.readUInt32BE(offset), end = offset + 12 + size;
    if (end > bytes.length) bad();
    const type = bytes.subarray(offset + 4, offset + 8).toString();
    const body = bytes.subarray(offset + 8, offset + 8 + size);
    if (crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) bad();
    if (!header && type !== 'IHDR') bad();
    if (type === 'IHDR') { if (header || size !== 13) bad(); header = body; }
    if (type === 'IDAT') data.push(body);
    if (type === 'IEND') { if (size !== 0 || end !== bytes.length) bad(); ended = true; }
    offset = end;
  }
  if (!header || !ended || !data.length || header.readUInt32BE(0) !== 1440
    || header.readUInt32BE(4) < 900 || header[8] !== 8 || ![2, 6].includes(header[9])
    || header[10] !== 0 || header[11] !== 0 || header[12] !== 0) bad();
  const stride = 1 + 1440 * (header[9] === 2 ? 3 : 4), size = stride * header.readUInt32BE(4);
  const decoded = inflateSync(Buffer.concat(data), { maxOutputLength: size });
  if (decoded.length !== size) bad();
  for (let row = 0; row < decoded.length; row += stride) if (decoded[row] > 4) bad();
}
