import { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation } from '@tanstack/react-query';
import { excelApi, ImportPreview, ImportSummary } from '../api/excel';
import './ImportProductsModal.css';

interface ImportProductsModalProps {
    onClose: () => void;
    onSuccess: () => void;
}

type ApiError = {
    response?: { data?: { error?: { message?: string } } };
};

export default function ImportProductsModal({ onClose, onSuccess }: ImportProductsModalProps) {
    const [file, setFile] = useState<File | null>(null);
    const [reviewed, setReviewed] = useState<{ file: File; summary: ImportPreview } | null>(null);
    const preview = reviewed?.file === file ? reviewed.summary : null;
    const [confirmResult, setConfirmResult] = useState<ImportSummary | null>(null);
    const titleId = useId();
    const dialogRef = useRef<HTMLDivElement>(null);
    const mounted = useRef(false);
    // React Query's pending render is asynchronous; guard same-tick actions too.
    const requestPending = useRef(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useLayoutEffect(() => {
        mounted.current = true;
        const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const dialog = dialogRef.current;
        fileInputRef.current?.focus();
        return () => {
            mounted.current = false;
            // Never take focus back from a newer dialog/navigation.
            if (opener?.isConnected && (dialog?.contains(document.activeElement) || document.activeElement === document.body)) {
                opener.focus();
            }
        };
    }, []);

    const previewMutation = useMutation({
        mutationFn: (f: File) => excelApi.previewImportProducts(f),
        onSuccess: (data, reviewedFile) => {
            if (mounted.current) setReviewed({ file: reviewedFile, summary: data });
        },
        onSettled: () => { requestPending.current = false; },
        onError: (err: unknown) => {
            if (!mounted.current) return;
            const msg = (err as ApiError).response?.data?.error?.message
                ?? (err instanceof Error ? err.message : 'Preview failed');
            alert(msg);
        },
    });

    const confirmMutation = useMutation({
        onSettled: () => { requestPending.current = false; },
        mutationFn: (input: { file: File; previewToken: string }) => excelApi.confirmImportProducts(input.file, input.previewToken),
        onSuccess: (data) => {
            if (!mounted.current) return;
            setConfirmResult(data);
            onSuccess();
        },
        onError: (err: unknown) => {
            if (!mounted.current) return;
            setReviewed(null);
            const msg = (err as ApiError).response?.data?.error?.message
                ?? (err instanceof Error ? err.message : 'Import failed');
            alert(msg);
        },
    });

    const busy = previewMutation.isPending || confirmMutation.isPending;

    useLayoutEffect(() => {
        // Pending controls are disabled; the dialog remains a keyboard target.
        if (document.activeElement === dialogRef.current && !busy && !requestPending.current) {
            (fileInputRef.current ?? dialogRef.current?.querySelector<HTMLButtonElement>('button'))?.focus();
        }
    });

    function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            handleClose();
        }
        if (e.key !== 'Tab') return;
        const dialog = dialogRef.current;
        if (!dialog) return;
        const controls = Array.from(dialog.querySelectorAll<HTMLElement>('input:not(:disabled), button:not(:disabled)'));
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (!first) {
            e.preventDefault();
            dialog.focus();
        } else if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || document.activeElement === dialog)) {
            e.preventDefault();
            first.focus();
        }
    }

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        if (requestPending.current || busy) return;
        const f = e.target.files?.[0] ?? null;
        setFile(f);
        setReviewed(null);
        setConfirmResult(null);
    }

    function handlePreview() {
        if (!mounted.current || requestPending.current || busy) return;
        if (!file) {
            alert('Please choose an .xlsx file first.');
            return;
        }
        requestPending.current = true;
        dialogRef.current?.focus();
        previewMutation.mutate(file);
    }

    function handleConfirm() {
        if (!mounted.current || !file || !preview?.previewToken || requestPending.current || busy) return;
        requestPending.current = true;
        dialogRef.current?.focus();
        confirmMutation.mutate({ file, previewToken: preview.previewToken });
    }

    function handleClose() {
        if (!mounted.current || requestPending.current || busy) return;
        setFile(null);
        setReviewed(null);
        setConfirmResult(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        onClose();
    }

    return createPortal(
        <div
            className="import-products-overlay"
            onMouseDown={(event) => {
                // A pending backdrop click must not move focus out of the trap.
                if (event.target === event.currentTarget) event.preventDefault();
            }}
            onClick={handleClose}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-busy={busy}
                tabIndex={-1}
                onKeyDown={handleKeyDown}
                className="import-products-dialog card"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 id={titleId} className="modal-title">Import Products from Excel</h2>

                {!confirmResult && (
                    <div className="input-group">
                        <label className="input-label" htmlFor="product-import-file">Excel File (.xlsx)</label>
                        <input
                            id="product-import-file"
                            ref={fileInputRef}
                            type="file"
                            disabled={busy}
                            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                            className="input-field"
                            onChange={handleFileChange}
                        />
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                            Expected columns: sku, name, description, cost_price, retail_price, stock_quantity, safety_stock.
                        </p>
                        {!preview && <p style={{ fontSize: '13px', marginTop: '8px' }}>
                            此匯入只更新商品資料。庫存欄位不會匯入；既有庫存保持原值，新商品庫存從 0 開始，請另行收貨或開帳。
                        </p>}
                    </div>
                )}

                {preview && !confirmResult && (
                    <div style={{ marginTop: '16px' }}>
                        <h3 style={{ marginBottom: '8px' }}>Preview</h3>
                        {preview.warnings.map((warning) => <p key={warning}>{warning}</p>)}
                        <div className="flex gap-12" style={{ marginBottom: '12px' }}>
                            <span className="badge badge-success">{preview.created} to create</span>
                            <span className="badge badge-warning">{preview.updated} to update</span>
                            <span className={preview.errors.length > 0 ? 'badge badge-danger' : 'badge'}>
                                {preview.errors.length} errors
                            </span>
                        </div>
                        {preview.errors.length > 0 && (
                            <div className="table-container" style={{ maxHeight: '240px', overflow: 'auto' }}>
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th style={{ width: '80px' }}>Row</th>
                                            <th>Error</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {preview.errors.map((err) => (
                                            <tr key={err.row}>
                                                <td>{err.row}</td>
                                                <td style={{ fontSize: '13px' }}>{err.message}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {confirmResult && (
                    <div style={{ marginTop: '16px' }}>
                        <h3 style={{ marginBottom: '8px' }}>Import Complete</h3>
                        <div className="flex gap-12">
                            <span className="badge badge-success">{confirmResult.created} created</span>
                            <span className="badge">{confirmResult.updated} updated</span>
                            {confirmResult.errors.length > 0 && (
                                <span className="badge badge-danger">{confirmResult.errors.length} errors</span>
                            )}
                        </div>
                    </div>
                )}

                <div className="modal-actions">
                    <button type="button" className="btn btn-ghost" onClick={handleClose} disabled={busy}>
                        {confirmResult ? 'Close' : 'Cancel'}
                    </button>
                    {!preview && !confirmResult && (
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={handlePreview}
                            disabled={!file || busy}
                        >
                            {previewMutation.isPending ? 'Previewing...' : 'Preview'}
                        </button>
                    )}
                    {preview && !confirmResult && (
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={handleConfirm}
                            disabled={busy || !preview.previewToken}
                        >
                            {confirmMutation.isPending ? 'Importing...' : 'Confirm Import'}
                        </button>
                    )}
                </div>
            </div>
        </div>,
        document.body,
    );
}
