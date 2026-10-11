import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// File chooser and multipart identity fixtures, deliberately not parser inputs.
// This browser slice intercepts HTTP and does not claim XLSX parsing acceptance.
export const files = ['a', 'b'].map(letter => ({ name: `synthetic-${letter}.xlsx`,
  mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  buffer: Buffer.from(`synthetic import browser file ${letter}; never send to a backend`) }));
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function importRequestAllowed(method, target, origin) {
  const url = new URL(target);
  return method === 'POST' && url.origin === origin && !url.search &&
    ['/api/v1/admin/excel/import/products/preview', '/api/v1/admin/excel/import/products/confirm'].includes(url.pathname);
}
export async function readImportRequest(target, contentType, bytes) {
  assert.ok(bytes && bytes.length < 4096, 'Only the small synthetic import payload is admitted');
  assert.match(contentType ?? '', /^multipart\/form-data; boundary=/);
  const data = await new Response(new Uint8Array(bytes), { headers: { 'content-type': contentType } }).formData();
  const file = data.get('file');
  assert.ok(file instanceof File);
  const fileSha256 = digest(Buffer.from(await file.arrayBuffer()));
  assert.ok(files.some(candidate => candidate.name === file.name && digest(candidate.buffer) === fileSha256));
  const endpoint = new URL(target).pathname.split('/').pop();
  assert.deepEqual([...data.keys()].sort(), endpoint === 'preview' ? ['file'] : ['file', 'previewToken']);
  const token = data.get('previewToken');
  if (endpoint === 'confirm') assert.ok(typeof token === 'string' && /^synthetic-token-[ab]$/.test(token));
  return { endpoint, fileName: file.name, fileSha256, token };
}

export function assertImportNetwork(data) {
  assert.ok(Array.isArray(data.imports));
  for (const entry of data.imports) {
    assert.ok(['preview', 'confirm'].includes(entry.endpoint));
    assert.ok(files.some(file => file.name === entry.fileName && digest(file.buffer) === entry.fileSha256));
    if (entry.endpoint === 'preview') assert.equal(entry.token, null);
    else assert.match(entry.token, /^synthetic-token-[ab]$/);
  }
}
