import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
export function writeExclusive(directory, name, bytes) {
  assert.match(name, /^[a-z0-9-]+\.(json|png)$/); mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, name), bytes, { flag: 'wx' });
}
export function writeJson(directory, name, value) { writeExclusive(directory, name, JSON.stringify(value, null, 2) + '\n'); }
export async function capture(page, directory, stage, metadata) {
  assert.match(stage, /^[a-z0-9-]+$/); await page.evaluate(() => document.fonts.ready);
  // Buffer first, then exclusively create the actual PNG. page.screenshot({path})
  // overwrites and cannot satisfy immutable evidence even if a fake writer can.
  const bytes = await page.screenshot({ fullPage: false });
  writeExclusive(directory, `${stage}.png`, bytes);
  writeJson(directory, `${stage}.json`, { ...metadata, stage, viewport: page.viewportSize(), sha256: createHash('sha256').update(bytes).digest('hex') });
}
export async function controlGeometry(locator) {
  return locator.evaluate(node => {
    const rect = node.getBoundingClientRect(), style = getComputedStyle(node);
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom,
      viewportWidth: innerWidth, viewportHeight: innerHeight, active: document.activeElement === node,
      centerHit: hit === node || node.contains(hit), outlineWidth: Number.parseFloat(style.outlineWidth),
      outlineOffset: Number.parseFloat(style.outlineOffset), outlineColor: style.outlineColor,
      disabled: node.matches(':disabled'), text: node.textContent,
      scroll: Array.from((function* () { for (let parent = node.parentElement; parent; parent = parent.parentElement) yield parent; })()).filter(parent => parent.scrollHeight > parent.clientHeight || parent.scrollWidth > parent.clientWidth).map(parent => ({ tag: parent.tagName, className: parent.className, left: parent.scrollLeft, top: parent.scrollTop, width: parent.clientWidth, height: parent.clientHeight, scrollWidth: parent.scrollWidth, scrollHeight: parent.scrollHeight })) };
  }, undefined, { timeout: 1000 });
}
export function assertControlGeometry(value, { focus = true } = {}) {
  assert.ok(value.width >= 44 && value.height >= 44, 'Original POS 44px hit target');
  assert.equal(value.centerHit, true); assert.equal(value.disabled, false);
  const clearance = focus ? Math.max(0, value.outlineWidth + value.outlineOffset) : 0;
  if (focus) { assert.equal(value.active, true); assert.ok(value.outlineWidth >= 2); assert.notEqual(value.outlineColor, 'rgba(0, 0, 0, 0)'); }
  assert.ok(value.x >= clearance && value.y >= clearance && value.right + clearance <= value.viewportWidth && value.bottom + clearance <= value.viewportHeight, 'Complete focused control remains in the viewport');
}
export async function fontProof(page, selector) {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('DOM.enable'); await session.send('CSS.enable');
    const { root } = await session.send('DOM.getDocument');
    const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    assert.ok(nodeId > 0, 'Actual capture text node must exist');
    const { fonts } = await session.send('CSS.getPlatformFontsForNode', { nodeId });
    assert.ok(fonts.some(font => font.isCustomFont === false && /Noto Sans CJK/.test(font.familyName) && font.glyphCount > 0));
    return fonts;
  } finally { await session.detach(); }
}

export async function observeControl(read, { timeoutMs = 3000, intervalMs = 50, clock = () => performance.now(), sleep = delay } = {}) {
  const start = clock(), samples = []; let previous = null;
  const signature = value => JSON.stringify([value.x,value.y,value.width,value.height,value.outlineWidth,value.outlineOffset,value.outlineColor,value.active,value.centerHit]);
  while (clock() - start < timeoutMs) {
    const value = await read();
    if (clock() - start >= timeoutMs) return { ok: false, reason: 'late-read', samples, lateRead: value, elapsedMs: clock() - start };
    samples.push({ elapsedMs: clock() - start, ...value });
    let valid = true; try { assertControlGeometry(value); } catch { valid = false; }
    if (valid && previous === signature(value)) return { ok: true, samples, final: value, elapsedMs: clock() - start };
    previous = valid ? signature(value) : null;
    await sleep(Math.min(intervalMs, Math.max(0, timeoutMs - (clock() - start))));
  }
  return { ok: false, reason: 'deadline', samples, elapsedMs: clock() - start };
}
