import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ManualScanDialog from '../components/ManualScanDialog';
import { onBarcode, onScanResult, startBarcodeListener, stopBarcodeListener } from '../services/barcodeService';

afterEach(() => { cleanup(); stopBarcodeListener(); });
function paste(literal: string) {
  fireEvent.paste(screen.getByLabelText('掃描文字'), { clipboardData: { getData: () => literal } });
  fireEvent.click(screen.getByRole('button', { name: '檢視掃描結果' }));
}

describe('manual scan local evidence dialog', () => {
  it.each(['  001aBc  ', ']C101000123\u001d10LOT', '\u0000A\tB\r\nC\rD\n ', 'https://example.invalid/item', 'e\u0301中文', '0'])('keeps exact clipboard literal %j and explicit unknown metadata without emitting', (literal) => {
    const legacy = vi.fn(), stream = vi.fn();
    const offLegacy = onBarcode(legacy), offStream = onScanResult(stream);
    try {
      startBarcodeListener(); render(<ManualScanDialog onClose={vi.fn()} />); paste(literal);
      expect(JSON.parse(screen.getByLabelText('原始 literal').textContent!)).toBe(literal);
      const result = JSON.parse(screen.getByLabelText('掃描證據 JSON').textContent!);
      expect(result).toEqual({ contractVersion: 1, source: 'manual', literal,
        bytes: { status: 'unknown' }, symbology: { status: 'unknown' }, gs1: { status: 'unknown' },
        decoder: { name: 'manual-text', version: '1' }, evidence: { inputRoute: 'manual-text', hardwareVerified: false } });
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(legacy).not.toHaveBeenCalled(); expect(stream).not.toHaveBeenCalled();
    } finally { offLegacy(); offStream(); }
  });

  it('captures typed short text only on request, invalidates previous result and replaces all text on paste', () => {
    render(<ManualScanDialog onClose={vi.fn()} />);
    const input = screen.getByLabelText('掃描文字');
    const capture = screen.getByRole('button', { name: '檢視掃描結果' });
    expect(input).toHaveFocus(); expect(capture).toBeDisabled();
    fireEvent.change(input, { target: { value: '0' } });
    expect(screen.queryByRole('region', { name: '只讀掃描結果' })).not.toBeInTheDocument();
    fireEvent.click(capture); expect(screen.getByLabelText('原始 literal')).toHaveTextContent('"0"');
    fireEvent.change(input, { target: { value: '  ' } });
    expect(screen.queryByLabelText('原始 literal')).not.toBeInTheDocument();
    paste('  AbC  ');
    expect(JSON.parse(screen.getByLabelText('原始 literal').textContent!)).toBe('  AbC  ');
  });

  it('contains Tab and escaped focus, allows native Enter activation, and restores background attributes and opener', async () => {
    const user = userEvent.setup();
    const opener = document.createElement('button'); document.body.append(opener); opener.focus();
    const background = document.createElement('div'); background.setAttribute('aria-hidden', 'false'); document.body.append(background);
    const onClose = vi.fn(); const view = render(<ManualScanDialog onClose={onClose} />);
    const input = screen.getByLabelText('掃描文字'); const close = screen.getByRole('button', { name: '關閉' });
    expect(opener).toHaveAttribute('inert'); expect(background).toHaveAttribute('aria-hidden', 'true');
    await user.tab({ shift: true }); expect(close).toHaveFocus();
    await user.tab(); expect(input).toHaveFocus();
    await user.type(input, '001aB'); await user.tab();
    await user.keyboard('{Enter}'); expect(screen.getByLabelText('原始 literal')).toHaveTextContent('001aB');
    const summary = screen.getByText('完整掃描證據'); summary.focus();
    await user.tab(); expect(input).toHaveFocus();
    opener.focus(); expect(input).toHaveFocus();
    fireEvent.keyDown(document.body, { key: 'F7' }); expect(input).toHaveFocus();
    fireEvent.keyDown(document.body, { key: 'Escape' }); expect(onClose).toHaveBeenCalledOnce();
    view.unmount(); expect(opener).toHaveFocus(); expect(opener).not.toHaveAttribute('inert');
    expect(background).toHaveAttribute('aria-hidden', 'false');
    opener.remove(); background.remove();
  });

  it('drops result on unmount/reopen and removes keyboard ownership', () => {
    const pageKey = vi.fn(); window.addEventListener('keydown', pageKey);
    const view = render(<ManualScanDialog onClose={vi.fn()} />); paste('001');
    fireEvent.keyDown(document.body, { key: 'F4' }); expect(pageKey).not.toHaveBeenCalled();
    view.unmount(); fireEvent.keyDown(document.body, { key: 'F4' }); expect(pageKey).toHaveBeenCalledOnce();
    render(<ManualScanDialog onClose={vi.fn()} />);
    expect(screen.getByLabelText('掃描文字')).toHaveValue('');
    expect(screen.queryByLabelText('原始 literal')).not.toBeInTheDocument();
    window.removeEventListener('keydown', pageKey);
  });
});
