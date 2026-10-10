import assert from 'node:assert/strict';

// Pure receipt validation is shared with Playwright fixtures; never import the
// executable runner (with import.meta/process ownership) into the test loader.
export function assertCjkFonts(records, detailsOpen) {
  assert.deepEqual(records.map(record => record.selector), ['strong', 'p', 'summary', ...(detailsOpen ? ['li:nth-child(1)', 'li:nth-child(2)', 'li:nth-child(3)'] : [])]);
  for (const record of records) {
    assert.ok(record.fonts.some(font => /^Noto Sans CJK(?: |$)/.test(font.familyName) && font.glyphCount > 0 && font.isCustomFont === false),
      `Actual CJK glyphs missing for ${record.selector}`);
  }
}
