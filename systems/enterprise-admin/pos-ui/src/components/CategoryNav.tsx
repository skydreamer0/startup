import { useLayoutEffect, useRef } from 'react';
import { horizontalRevealDelta } from '../lib/horizontalReveal';

interface Category {
  id: string;
  name: string;
}

interface Props {
  categories: Category[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

function reveal(nav: HTMLElement | null, button: HTMLButtonElement) {
  if (!nav || !nav.clientWidth) return;
  const viewportLeft = nav.getBoundingClientRect().left + nav.clientLeft;
  const { left, right } = button.getBoundingClientRect();
  // Scroll only this strip: scrollIntoView could also move the product/cart page.
  nav.scrollLeft += horizontalRevealDelta(left, right, viewportLeft, viewportLeft + nav.clientWidth);
}

function revealCurrent(nav: HTMLElement) {
  const focused = document.activeElement;
  const button = focused instanceof HTMLButtonElement && nav.contains(focused)
    ? focused : nav.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
  if (button) reveal(nav, button);
}

export default function CategoryNav({ categories, selectedId, onSelect }: Props) {
  const all = [{ id: null as string | null, name: '全部' }, ...categories];
  const navRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    // Selection adds a checkmark and bold text after native focus scrolling.
    const nav = navRef.current;
    if (!nav) return;
    revealCurrent(nav);
    if (typeof ResizeObserver === 'undefined') return;
    let active = true;
    const observer = new ResizeObserver(() => { if (active) revealCurrent(nav); });
    observer.observe(nav);
    const selected = nav.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
    if (selected) observer.observe(selected);
    let focused: HTMLButtonElement | null = null;
    const observeFocused = (target: EventTarget | null) => {
      const next = target instanceof HTMLButtonElement && nav.contains(target) ? target : null;
      if (next === focused) return;
      if (focused && focused !== selected) observer.unobserve(focused);
      focused = next;
      if (focused && focused !== selected) observer.observe(focused);
    };
    // A late font can resize only the unselected button that currently owns focus.
    // focusout's relatedTarget is used because activeElement can still be the old button.
    const onFocusIn = (event: FocusEvent) => observeFocused(event.target);
    const onFocusOut = (event: FocusEvent) => observeFocused(event.relatedTarget);
    nav.addEventListener('focusin', onFocusIn);
    nav.addEventListener('focusout', onFocusOut);
    observeFocused(document.activeElement);
    return () => {
      active = false;
      nav.removeEventListener('focusin', onFocusIn);
      nav.removeEventListener('focusout', onFocusOut);
      observer.disconnect();
    };
  }, [selectedId, categories]);

  return (
    <nav ref={navRef} aria-label="商品分類" className="pos-category-nav">
      {all.map((category) => (
        <button
          type="button"
          aria-pressed={selectedId === category.id}
          key={category.id ?? 'all'}
          onClick={() => onSelect(category.id)}
          onFocus={(event) => reveal(navRef.current, event.currentTarget)}
          className={`pos-category-btn${selectedId === category.id ? ' pos-category-btn--active' : ''}`}
        >
          {selectedId === category.id && <span aria-hidden="true">✓ </span>}
          {category.name}
        </button>
      ))}
    </nav>
  );
}
