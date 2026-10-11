import { describe, it, expect, vi } from 'vitest';
import { StrictMode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CategoryNav from '../components/CategoryNav';

const categories = [
  { id: 'pain', name: 'Pain Relief' },
  { id: 'cold', name: 'Cold Care' },
];

function mockCategoryResizes() {
  const instances: TrackingObserver[] = [];
  class TrackingObserver implements ResizeObserver {
    readonly observed = new Set<Element>();
    constructor(private readonly callback: ResizeObserverCallback) { instances.push(this); }
    observe = vi.fn((target: Element) => { this.observed.add(target); });
    unobserve = vi.fn((target: Element) => { this.observed.delete(target); });
    disconnect = vi.fn(() => { this.observed.clear(); });
    resize(target: Element) { if (this.observed.has(target)) this.callback([], this); }
    deliverQueuedCallback() { this.callback([], this); }
  }
  vi.stubGlobal('ResizeObserver', TrackingObserver);
  return instances;
}

describe('CategoryNav', () => {
  it('renders an all-category button before real categories', () => {
    render(<CategoryNav categories={categories} selectedId={null} onSelect={vi.fn()} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);
    expect(buttons[1]).toHaveTextContent('Pain Relief');
    expect(buttons[2]).toHaveTextContent('Cold Care');
  });

  it('selects a category by id', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<CategoryNav categories={categories} selectedId={null} onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: 'Cold Care' }));

    expect(onSelect).toHaveBeenCalledWith('cold');
  });

  it('selects null when the all-category button is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<CategoryNav categories={categories} selectedId="pain" onSelect={onSelect} />);

    await user.click(screen.getAllByRole('button')[0]);

    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('marks the selected category as active', () => {
    render(<CategoryNav categories={categories} selectedId="pain" onSelect={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Pain Relief' })).toHaveClass('pos-category-btn--active');
  });
});

it('supports touch selection and keyboard focus with a readable selected state', async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  render(<CategoryNav categories={categories} selectedId="pain" onSelect={onSelect} />);
  const target = screen.getByRole('button', { name: 'Cold Care' });
  await user.pointer([{ keys: '[TouchA>]', target }, { keys: '[/TouchA]', target }]);
  expect(onSelect).toHaveBeenCalledWith('cold');
  expect(screen.getByRole('button', { name: 'Pain Relief' })).toHaveAttribute('aria-pressed', 'true');
  expect(target).toHaveAttribute('aria-pressed', 'false');
  target.focus();
  await user.keyboard('{Enter}');
  expect(onSelect).toHaveBeenCalledTimes(2);
});

it('rechecks the selected label after its active styling expands its right edge', () => {
  const onSelect = vi.fn();
  const view = render(<CategoryNav categories={categories} selectedId={null} onSelect={onSelect} />);
  const nav = screen.getByRole('navigation', { name: '商品分類' });
  const button = screen.getByRole('button', { name: 'Cold Care' });
  Object.defineProperty(nav, 'clientWidth', { configurable: true, value: 390 });
  vi.spyOn(nav, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 100, 390, 68));
  vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(new DOMRect(253, 114, 133, 44));
  button.focus();
  expect(nav.scrollLeft).toBe(0);
  vi.mocked(button.getBoundingClientRect).mockReturnValue(new DOMRect(253, 114, 164, 44));
  nav.scrollTop = 7;
  view.rerender(<CategoryNav categories={categories} selectedId="cold" onSelect={onSelect} />);
  expect(nav.scrollLeft).toBe(31);
  expect(nav.scrollTop).toBe(7);
  expect(button).toHaveFocus();
  expect(onSelect).not.toHaveBeenCalled();
});

it('reveals a focused category at the left edge without changing selection', () => {
  const onSelect = vi.fn();
  render(<CategoryNav categories={categories} selectedId="cold" onSelect={onSelect} />);
  const nav = screen.getByRole('navigation', { name: '商品分類' });
  const button = screen.getByRole('button', { name: 'Pain Relief' });
  Object.defineProperty(nav, 'clientWidth', { configurable: true, value: 390 });
  vi.spyOn(nav, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 100, 390, 68));
  vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(new DOMRect(-10, 114, 160, 44));
  nav.scrollLeft = 80;
  button.focus();
  expect(nav.scrollLeft).toBe(66);
  expect(button).toHaveAttribute('aria-pressed', 'false');
  expect(onSelect).not.toHaveBeenCalled();
});

it('keeps the focused unselected category visible across category refreshes', () => {
  const onSelect = vi.fn();
  const view = render(<CategoryNav categories={categories} selectedId="pain" onSelect={onSelect} />);
  const nav = screen.getByRole('navigation', { name: '商品分類' });
  const button = screen.getByRole('button', { name: 'Cold Care' });
  Object.defineProperty(nav, 'clientWidth', { configurable: true, value: 390 });
  vi.spyOn(nav, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 100, 390, 68));
  vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(new DOMRect(253, 114, 133, 44));
  button.focus();
  nav.scrollLeft = 80;
  vi.mocked(button.getBoundingClientRect).mockReturnValue(new DOMRect(-10, 114, 160, 44));
  view.rerender(<CategoryNav categories={[...categories]} selectedId="pain" onSelect={onSelect} />);
  expect(nav.scrollLeft).toBe(66);
  expect(button).toHaveFocus();
  expect(button).toHaveAttribute('aria-pressed', 'false');
  expect(onSelect).not.toHaveBeenCalled();
});

it('reveals the focused category after resize and disconnects its observer', () => {
  let resized = () => {};
  const disconnect = vi.fn();
  class Observer {
    constructor(callback: ResizeObserverCallback) { resized = () => callback([], this); }
    observe() {}
    unobserve() {}
    disconnect = disconnect;
  }
  vi.stubGlobal('ResizeObserver', Observer);
  try {
    const view = render(<CategoryNav categories={categories} selectedId="pain" onSelect={vi.fn()} />);
    const nav = screen.getByRole('navigation', { name: '商品分類' });
    const button = screen.getByRole('button', { name: 'Cold Care' });
    Object.defineProperty(nav, 'clientWidth', { configurable: true, value: 390 });
    vi.spyOn(nav, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 100, 390, 68));
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(new DOMRect(253, 114, 133, 44));
    button.focus();
    Object.defineProperty(nav, 'clientWidth', { configurable: true, value: 320 });
    resized();
    expect(nav.scrollLeft).toBe(70);
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute('aria-pressed', 'false');
    view.unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  } finally {
    vi.unstubAllGlobals();
  }
});

it('does not steal search focus or vertical scroll when categories refresh', () => {
  const renderNav = (rows: typeof categories) => <><input aria-label="搜尋" /><CategoryNav categories={rows} selectedId="cold" onSelect={vi.fn()} /></>;
  const view = render(renderNav(categories));
  const search = screen.getByRole('textbox', { name: '搜尋' });
  const nav = screen.getByRole('navigation', { name: '商品分類' });
  const button = screen.getByRole('button', { name: 'Cold Care' });
  Object.defineProperty(nav, 'clientWidth', { configurable: true, value: 390 });
  vi.spyOn(nav, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 100, 390, 68));
  vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(new DOMRect(253, 114, 164, 44));
  search.focus();
  nav.scrollTop = 7;
  const beforeY = window.scrollY;
  view.rerender(renderNav([...categories]));
  expect(nav.scrollLeft).toBe(31);
  expect(nav.scrollTop).toBe(7);
  expect(window.scrollY).toBe(beforeY);
  expect(search).toHaveFocus();
});

it('reveals a focused unselected label when only that label grows after font loading', () => {
  const observers = mockCategoryResizes();
  const onSelect = vi.fn();
  const view = render(<CategoryNav categories={categories} selectedId={null} onSelect={onSelect} />);
  try {
    const nav = screen.getByRole('navigation', { name: '商品分類' });
    const selected = screen.getByRole('button', { name: '全部' });
    const focused = screen.getByRole('button', { name: 'Cold Care' });
    Object.defineProperty(nav, 'clientWidth', { configurable: true, value: 390 });
    vi.spyOn(nav, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 100, 390, 68));
    vi.spyOn(focused, 'getBoundingClientRect').mockReturnValue(new DOMRect(253, 114, 133, 44));
    focused.focus();
    expect(nav.scrollLeft).toBe(0);
    expect(observers[0].observed).toEqual(new Set([nav, selected, focused]));
    nav.scrollTop = 7;
    const pageY = window.scrollY;
    // Neither the Chinese selected label nor the strip changes size.
    vi.mocked(focused.getBoundingClientRect).mockReturnValue(new DOMRect(253, 114, 152, 44));
    observers[0].resize(focused);
    expect(nav.scrollLeft).toBe(19);
    expect(nav.scrollTop).toBe(7);
    expect(window.scrollY).toBe(pageY);
    expect(focused).toHaveFocus();
    expect(focused).toHaveAttribute('aria-pressed', 'false');
    expect(selected).toHaveAttribute('aria-pressed', 'true');
    expect(onSelect).not.toHaveBeenCalled();
  } finally { view.unmount(); vi.unstubAllGlobals(); }
});

it('transfers focused observation on focus and blur while retaining the selected button', () => {
  const observers = mockCategoryResizes();
  const view = render(<><input aria-label="搜尋" /><CategoryNav categories={categories} selectedId={null} onSelect={vi.fn()} /></>);
  try {
    const nav = screen.getByRole('navigation', { name: '商品分類' });
    const selected = screen.getByRole('button', { name: '全部' });
    const cold = screen.getByRole('button', { name: 'Cold Care' });
    const pain = screen.getByRole('button', { name: 'Pain Relief' });
    cold.focus();
    pain.focus();
    expect(observers[0].observed).toEqual(new Set([nav, selected, pain]));
    expect(observers[0].unobserve).toHaveBeenCalledWith(cold);
    selected.focus();
    expect(observers[0].observed).toEqual(new Set([nav, selected]));
    cold.focus();
    screen.getByRole('textbox', { name: '搜尋' }).focus();
    expect(observers[0].observed).toEqual(new Set([nav, selected]));
    expect(observers[0].unobserve).not.toHaveBeenCalledWith(selected);
    cold.focus();
    cold.blur(); // A null relatedTarget also releases the former focused button.
    expect(observers[0].observed).toEqual(new Set([nav, selected]));
  } finally { view.unmount(); vi.unstubAllGlobals(); }
});

it('rebinds focused observation after rerender and removes listeners and queued work on cleanup', () => {
  const observers = mockCategoryResizes();
  const view = render(<StrictMode><CategoryNav categories={categories} selectedId="pain" onSelect={vi.fn()} /></StrictMode>);
  try {
    const nav = screen.getByRole('navigation', { name: '商品分類' });
    const focused = screen.getByRole('button', { name: 'Cold Care' });
    Object.defineProperty(nav, 'clientWidth', { configurable: true, value: 390 });
    vi.spyOn(nav, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 100, 390, 68));
    vi.spyOn(focused, 'getBoundingClientRect').mockReturnValue(new DOMRect(253, 114, 133, 44));
    focused.focus();
    const old = observers[observers.length - 1];
    view.rerender(<StrictMode><CategoryNav categories={[...categories]} selectedId={null} onSelect={vi.fn()} /></StrictMode>);
    const current = observers[observers.length - 1];
    expect(current).not.toBe(old);
    expect(old.disconnect).toHaveBeenCalledOnce();
    expect(current.observed.has(focused)).toBe(true);
    vi.mocked(focused.getBoundingClientRect).mockReturnValue(new DOMRect(253, 114, 152, 44));
    old.deliverQueuedCallback();
    expect(nav.scrollLeft).toBe(0);
    current.resize(focused);
    expect(nav.scrollLeft).toBe(19);
    view.unmount();
    nav.scrollLeft = 0;
    const observeCalls = current.observe.mock.calls.length;
    focused.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    focused.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: focused }));
    current.deliverQueuedCallback();
    expect(current.observe).toHaveBeenCalledTimes(observeCalls);
    expect(current.observed.size).toBe(0);
    expect(current.disconnect).toHaveBeenCalledOnce();
    expect(nav.scrollLeft).toBe(0);
    expect(observers.every(observer => observer.disconnect.mock.calls.length === 1)).toBe(true);
  } finally { view.unmount(); vi.unstubAllGlobals(); }
});

it('keeps focus scrolling available when ResizeObserver is unavailable', () => {
  vi.stubGlobal('ResizeObserver', undefined);
  const view = render(<CategoryNav categories={categories} selectedId={null} onSelect={vi.fn()} />);
  try {
    const nav = screen.getByRole('navigation', { name: '商品分類' });
    const focused = screen.getByRole('button', { name: 'Cold Care' });
    Object.defineProperty(nav, 'clientWidth', { configurable: true, value: 390 });
    vi.spyOn(nav, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 100, 390, 68));
    vi.spyOn(focused, 'getBoundingClientRect').mockReturnValue(new DOMRect(253, 114, 152, 44));
    focused.focus();
    expect(nav.scrollLeft).toBe(19);
    expect(focused).toHaveFocus();
  } finally { view.unmount(); vi.unstubAllGlobals(); }
});
