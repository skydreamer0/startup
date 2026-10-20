import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { capture, writeJson } from '../recovery-native/evidence.mjs';
import { assertFonts } from '../category-native/contract.mjs';
const targets = { '#receipt-title': '登記批次進貨', '.batch-list-page .page-title': '批號效期管理' };
export async function readFontSnapshot(page, selector) {
  assert.ok(Object.hasOwn(targets, selector));
  const session = await page.context().newCDPSession(page); let primary = null;
  try {
    const target = await page.locator(selector).evaluate(node => { const rect = node.getBoundingClientRect(), css = getComputedStyle(node); return { text: node.textContent?.trim(), family: css.fontFamily, width: rect.width, height: rect.height, visible: css.display !== 'none' && css.visibility === 'visible' && Number(css.opacity) > 0 }; });
    await session.send('DOM.enable'); await session.send('CSS.enable');
    const { root } = await session.send('DOM.getDocument');
    const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    assert.ok(nodeId > 0, 'Actual capture text node must exist');
    const { fonts } = await session.send('CSS.getPlatformFontsForNode', { nodeId });
    return { selector, ...target, fonts };
  } catch (error) { primary = error; throw error; }
  finally { try { await session.detach(); } catch (error) { if (!primary) throw error; } }
}
export function assertFontSnapshot(value) {
  assert.ok(Object.hasOwn(targets, value.selector)); assert.equal(value.text, targets[value.selector]);
  assert.equal(value.visible, true); assert.ok(value.width > 0 && value.height > 0);
  assertFonts(value.fonts); // Original installed, noncustom Noto Sans CJK positive-glyph criterion.
}
export async function observeFonts(read, { timeoutMs = 2000, intervalMs = 50, clock = () => performance.now(), sleep = delay } = {}) {
  const started = clock(), samples = []; let previous = null;
  while (clock() - started < timeoutMs) {
    const value = await read(), elapsedMs = clock() - started;
    if (elapsedMs >= timeoutMs) return { ok: false, reason: 'late-read', samples, lateRead: value, elapsedMs };
    samples.push({ elapsedMs, ...value }); let valid = true;
    try { assertFontSnapshot(value); } catch { valid = false; }
    const signature = JSON.stringify(value);
    if (valid && previous === signature) return { ok: true, samples, final: value, elapsedMs };
    previous = valid ? signature : null;
    await sleep(Math.min(intervalMs, Math.max(0, timeoutMs - (clock() - started))));
  }
  return { ok: false, reason: 'deadline', samples, elapsedMs: clock() - started };
}
export function assertFontObservation(proof, fonts) {
  assert.equal(proof.ok, true); assert.ok(proof.samples.length >= 2); assert.ok(proof.elapsedMs >= 0 && proof.elapsedMs < 2000);
  const pair = proof.samples.slice(-2); pair.forEach(value => { assertFontSnapshot(value); assert.ok(value.elapsedMs >= 0 && value.elapsedMs <= proof.elapsedMs); });
  const strip = ({ elapsedMs, ...value }) => value;
  assert.deepEqual(strip(pair[0]), strip(pair[1])); assert.deepEqual(proof.final, strip(pair[1])); assert.deepEqual(fonts, proof.final.fonts);
}
export async function captureWithFonts(page, directory, stage, metadata, selector) {
  // Font loading and paint readiness are separate from React's visible element.
  // No CSS injection, fallback replacement or acceptance of a different family.
  await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  const observation = await observeFonts(() => readFontSnapshot(page, selector));
  if (!observation.ok) {
    const error = new Error('Installed Noto Sans CJK glyph proof did not converge');
    try { writeJson(directory, `${stage}-font-failure.json`, { ...metadata, stage, selector, observation }); } catch { /* Preserve the primary failed glyph criterion. */ }
    throw error;
  }
  await capture(page, directory, stage, { ...metadata, fonts: observation.final.fonts, fontObservation: observation });
}
