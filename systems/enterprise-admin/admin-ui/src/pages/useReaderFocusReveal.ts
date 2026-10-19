import { useCallback, useEffect, useRef } from 'react';

const clearance = 6; // Page-local 3px outline plus its 3px offset.
const controls = '.btn, .reader-toolbar .input-field, .reader-table-scroll';
const nearest = (start: number, end: number, low: number, high: number) =>
    start - clearance < low ? start - clearance - low : end + clearance > high ? end + clearance - high : 0;
const clamp = (value: number, maximum: number) => Math.max(0, Math.min(Math.max(0, maximum), value));

export function revealReaderFocus(target: HTMLElement, root: HTMLElement) {
    if (!root.contains(target) || document.activeElement !== target || !target.matches(controls) || target.matches(':disabled')) return;
    const scrolling = document.scrollingElement as HTMLElement | null;
    // Move only the target's own ancestors, never another table or the sidebar.
    for (let parent = target.parentElement; parent && parent !== scrolling; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        const horizontal = /^(auto|scroll)$/.test(style.overflowX) && parent.scrollWidth > parent.clientWidth;
        const vertical = /^(auto|scroll)$/.test(style.overflowY) && parent.scrollHeight > parent.clientHeight;
        if (!horizontal && !vertical) continue;
        const frame = parent.getBoundingClientRect(), box = target.getBoundingClientRect();
        const left = frame.left + parent.clientLeft, top = frame.top + parent.clientTop;
        const nextLeft = horizontal && parent.clientWidth > 0 ? clamp(parent.scrollLeft + nearest(box.left, box.right, left, left + parent.clientWidth), parent.scrollWidth - parent.clientWidth) : parent.scrollLeft;
        const nextTop = vertical && parent.clientHeight > 0 ? clamp(parent.scrollTop + nearest(box.top, box.bottom, top, top + parent.clientHeight), parent.scrollHeight - parent.clientHeight) : parent.scrollTop;
        if (nextLeft !== parent.scrollLeft || nextTop !== parent.scrollTop) parent.scrollTo({ left: nextLeft, top: nextTop, behavior: 'instant' });
    }
    if (!scrolling || scrolling.clientWidth <= 0 || scrolling.clientHeight <= 0) return;
    const box = target.getBoundingClientRect();
    const sidebarRight = document.querySelector('.sidebar')?.getBoundingClientRect().right ?? 0;
    const nextLeft = clamp(scrolling.scrollLeft + nearest(box.left, box.right, Math.max(0, sidebarRight), innerWidth), scrolling.scrollWidth - scrolling.clientWidth);
    const nextTop = clamp(scrolling.scrollTop + nearest(box.top, box.bottom, 0, innerHeight), scrolling.scrollHeight - scrolling.clientHeight);
    if (nextLeft !== scrolling.scrollLeft || nextTop !== scrolling.scrollTop) window.scrollTo({ left: nextLeft, top: nextTop, behavior: 'instant' });
}

export function useReaderFocusReveal() {
    const ref = useRef<HTMLDivElement>(null);
    const frame = useRef<number | null>(null);
    const schedule = useCallback(() => {
        if (frame.current !== null) cancelAnimationFrame(frame.current);
        frame.current = requestAnimationFrame(() => {
            frame.current = null;
            const root = ref.current, target = document.activeElement;
            if (root && target instanceof HTMLElement) revealReaderFocus(target, root);
        });
    }, []);
    useEffect(() => {
        // Reflow can clip the existing focus. Wait for native focus/resize scroll;
        // do not reset the page or move a control that already has ring clearance.
        const resized = () => schedule();
        window.addEventListener('resize', resized);
        return () => { window.removeEventListener('resize', resized); if (frame.current !== null) cancelAnimationFrame(frame.current); };
    }, [schedule]);
    return { ref, onFocusCapture: schedule };
}
