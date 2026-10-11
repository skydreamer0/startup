import { describe, expect, it } from 'vitest';
import { horizontalRevealDelta } from '../lib/horizontalReveal';

describe('horizontal category visibility', () => {
  it('reveals the active label and focus ring after its checkmark expands it', () => {
    expect(horizontalRevealDelta(253.328125, 417.0625, 0, 390)).toBe(31.0625);
  });
  it('keeps a fully visible control stationary', () => {
    expect(horizontalRevealDelta(20, 200, 0, 390)).toBe(0);
  });
  it('reveals the left edge when traversing backwards', () => {
    expect(horizontalRevealDelta(-10, 150, 0, 390)).toBe(-14);
  });
  it('includes ring space even when the button itself just fits', () => {
    expect(horizontalRevealDelta(230, 390, 0, 390)).toBe(4);
    expect(horizontalRevealDelta(0, 160, 0, 390)).toBe(-4);
  });
  it('uses the navigation scrollport rather than the page origin', () => {
    expect(horizontalRevealDelta(340, 510, 100, 490)).toBe(24);
  });
  it('keeps an oversized label start reachable without repeated movement', () => {
    expect(horizontalRevealDelta(20, 520, 0, 390)).toBe(16);
    expect(horizontalRevealDelta(4, 504, 0, 390)).toBe(0);
  });
  it('does nothing for an unmeasurable scrollport', () => {
    expect(horizontalRevealDelta(0, 0, 0, 0)).toBe(0);
  });
});
