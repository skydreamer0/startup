import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const identityFormat = '%{file}\t%{index}\t%{family}\t%{postscriptname}\n';
const sourceFormat = '%{file}\t%{index}\t%{family}\t%{postscriptname}\t%{charset}\n';
const digest = value => createHash('sha256').update(value).digest('hex');
const names = value => value.split(',').map(name => name.trim()).filter(Boolean);
export function parseFontRecords(output, withCharset = false) {
  assert.equal(typeof output, 'string');
  return output.trim().split('\n').filter(Boolean).map(line => {
    const parts = line.split('\t'); assert.equal(parts.length, withCharset ? 5 : 4, 'Exact fontconfig fields are required');
    const [file, index, family, postscript, charset] = parts;
    assert.match(index, /^\d+$/); assert.ok(Number.isSafeInteger(Number(index)));
    const record = { file, index: Number(index), families: names(family), postScriptNames: names(postscript) };
    assert.ok(record.families.length && record.postScriptNames.length, 'Font identity must be named');
    return withCharset ? { ...record, charset } : record;
  });
}
export function requiredCodepoints(text) {
  assert.match(text, /^[\u3400-\u9fff]+$/u, 'This proof is bounded to the exact CJK-only headings');
  return [...new Set([...text].map(character => character.codePointAt(0)))].sort((a, b) => a - b);
}
export function assertCharsetCoverage(charset, text) {
  assert.equal(typeof charset, 'string'); assert.ok(charset.trim());
  const ranges = charset.trim().split(/\s+/).map(token => {
    assert.match(token, /^[0-9a-f]+(?:-[0-9a-f]+)?$/i, 'Malformed font charset');
    const [first, last = first] = token.split('-').map(value => Number.parseInt(value, 16));
    assert.ok(first <= last && last <= 0x10ffff, 'Invalid font charset range'); return [first, last];
  });
  for (const codepoint of requiredCodepoints(text)) assert.ok(ranges.some(([first, last]) => first <= codepoint && codepoint <= last), 'Installed face must cover every target CJK codepoint');
}
export function assertPlatformFonts(fonts, text) {
  assert.ok(Array.isArray(fonts) && fonts.length > 0, 'Actual platform fonts must be present');
  const identities = new Set(); let count = 0;
  for (const font of fonts) {
    assert.equal(font.isCustomFont, false, 'Only installed platform faces are accepted');
    assert.ok(typeof font.familyName === 'string' && font.familyName.trim());
    assert.ok(typeof font.postScriptName === 'string' && font.postScriptName.trim());
    assert.ok(Number.isSafeInteger(font.glyphCount) && font.glyphCount > 0, 'Actual glyph count must be positive');
    const key = JSON.stringify([font.familyName, font.postScriptName]); assert.ok(!identities.has(key), 'Duplicate face evidence'); identities.add(key); count += font.glyphCount;
  }
  assert.equal(count, [...text].length, 'Actual glyph count must cover the complete exact heading');
}
export function assertFontSources(fonts, text, sources) {
  assertPlatformFonts(fonts, text); assert.ok(Array.isArray(sources)); assert.equal(sources.length, fonts.length);
  sources.forEach((source, index) => {
    const font = fonts[index]; assert.equal(source.familyName, font.familyName); assert.equal(source.postScriptName, font.postScriptName);
    assert.ok(source.file.startsWith('/usr/share/fonts/') && path.normalize(source.file) === source.file, 'Only canonical system font files are evidence');
    assert.ok(Number.isSafeInteger(source.index) && source.index >= 0);
    assert.ok(source.families.includes(font.familyName)); assert.ok(source.postScriptNames.includes(font.postScriptName));
    assert.ok(Number.isSafeInteger(source.bytes) && source.bytes > 0); assert.match(source.sha256, /^[a-f0-9]{64}$/);
    assertCharsetCoverage(source.charset, text); assert.equal(source.charsetSha256, digest(source.charset));
    assert.deepEqual(source.requiredCodepoints, requiredCodepoints(text));
  });
}
const command = (program, args) => execFileSync(program, args, { encoding: 'utf8', timeout: 5000, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
const system = { list: () => command('fc-list', ['--format', identityFormat]), query: (file, index) => command('fc-query', ['--index', String(index), '--format', sourceFormat, file]), realpath: file => fs.realpathSync(file), read: file => fs.readFileSync(file), stat: file => fs.statSync(file) };
export function createFontSourceReader(io = system) {
  let catalog;
  return (fonts, text) => {
    assertPlatformFonts(fonts, text);
    catalog ??= parseFontRecords(io.list());
    const sources = fonts.map(font => {
      const matches = [...new Map(catalog.filter(row => row.families.includes(font.familyName) && row.postScriptNames.includes(font.postScriptName)).map(row => [JSON.stringify([row.file, row.index]), row])).values()];
      assert.equal(matches.length, 1, 'Actual face must resolve to one installed file/index; unknown or ambiguous faces fail');
      const match = matches[0], file = io.realpath(match.file);
      assert.ok(file.startsWith('/usr/share/fonts/') && path.normalize(file) === file, 'Font file must remain in the system font directory');
      assert.ok(io.stat(file).isFile(), 'Installed font must be a regular file');
      const before = io.read(file), scanned = parseFontRecords(io.query(file, match.index), true);
      assert.equal(scanned.length, 1); const face = scanned[0];
      assert.equal(io.realpath(face.file), file); assert.equal(face.index, match.index);
      assert.ok(face.families.includes(font.familyName) && face.postScriptNames.includes(font.postScriptName), 'Scanned file identity must match the actual browser face');
      const after = io.read(file); assert.equal(digest(before), digest(after), 'Font changed while provenance was read');
      return { familyName: font.familyName, postScriptName: font.postScriptName, ...face, file, bytes: after.length, sha256: digest(after), charsetSha256: digest(face.charset), requiredCodepoints: requiredCodepoints(text) };
    });
    assertFontSources(fonts, text, sources); return sources;
  };
}
export const readInstalledFontSources = createFontSourceReader();
export function verifyInstalledFontSources(fonts, text, sources) {
  assertFontSources(fonts, text, sources);
  assert.deepEqual(sources, readInstalledFontSources(fonts, text), 'Captured font metadata/hash must match the current installed file');
}
