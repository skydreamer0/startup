import assert from 'node:assert/strict';
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
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  let offset = 8, header = null, ended = false;
  const data = [];
  while (offset < bytes.length) {
    assert.ok(offset + 12 <= bytes.length);
    const size = bytes.readUInt32BE(offset), end = offset + 12 + size;
    assert.ok(end <= bytes.length);
    const type = bytes.subarray(offset + 4, offset + 8).toString();
    const body = bytes.subarray(offset + 8, end - 4);
    assert.equal(crc32(bytes.subarray(offset + 4, end - 4)), bytes.readUInt32BE(end - 4));
    if (!header) assert.equal(type, 'IHDR');
    if (type === 'IHDR') { assert.equal(header, null); assert.equal(size, 13); header = body; }
    if (type === 'IDAT') data.push(body);
    if (type === 'IEND') { assert.equal(size, 0); assert.equal(end, bytes.length); ended = true; }
    offset = end;
  }
  assert.ok(header && ended && data.length);
  const width = header.readUInt32BE(0), height = header.readUInt32BE(4);
  assert.ok(width >= 390 && width <= 10000 && height >= 844 && height <= 20000);
  assert.equal(header[8], 8); assert.ok([2, 6].includes(header[9]));
  assert.deepEqual([...header.subarray(10)], [0, 0, 0]);
  const stride = 1 + width * (header[9] === 2 ? 3 : 4), size = stride * height;
  assert.ok(size <= 256 * 1024 * 1024);
  const decoded = inflateSync(Buffer.concat(data), { maxOutputLength: size });
  assert.equal(decoded.length, size);
  for (let row = 0; row < decoded.length; row += stride) assert.ok(decoded[row] <= 4);
  return { width, height };
}
