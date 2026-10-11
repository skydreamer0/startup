/** Smallest horizontal movement that leaves room for the category focus ring. */
export function horizontalRevealDelta(left: number, right: number, viewportLeft: number, viewportRight: number) {
  const inset = 4; // Two-pixel outline plus its two-pixel offset.
  const start = viewportLeft + inset;
  const end = viewportRight - inset;
  if (end <= start) return 0;
  // An oversized label cannot fit; keep its beginning reachable without oscillating.
  if (right - left > end - start || left < start) return left - start;
  return right > end ? right - end : 0;
}
