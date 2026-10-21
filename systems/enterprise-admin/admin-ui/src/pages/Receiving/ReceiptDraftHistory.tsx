import { useEffect, useState } from 'react';
import { receivingDraftsApi, type SavedReceivingDraft } from '../../api/receivingDrafts';
export default function ReceiptDraftHistory({ id, ownerId, tenantId, revision, onDenied }: { id: string; ownerId: string; tenantId: string; revision: number; onDenied: () => void }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [rows, setRows] = useState<{ revision: number; createdAt: string }[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [version, setVersion] = useState<SavedReceivingDraft | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController(); setRows(null); setError('');
    receivingDraftsApi.history(id, page, controller.signal).then(data => { if (!controller.signal.aborted) setRows(data); }).catch(e => {
      if (controller.signal.aborted) return;
      if ([401,403].includes(e?.response?.status)) onDenied();
      setError('版本清單讀取失敗，請重試。');
    });
    return () => controller.abort();
  }, [open, id, page, revision, retry, onDenied]);
  useEffect(() => {
    setVersion(null);
    if (selected === null) return;
    const controller = new AbortController(); setError('');
    receivingDraftsApi.version(id, selected, controller.signal).then(data => {
      if (controller.signal.aborted) return;
      if (data.ownerId !== ownerId || data.tenantId !== tenantId || data.id !== id || data.revision !== selected) { onDenied(); return; }
      setVersion(data);
    }).catch(e => {
      if (controller.signal.aborted) return;
      if ([401,403].includes(e?.response?.status)) onDenied();
      setError('版本內容讀取失敗，請重試。');
    });
    return () => controller.abort();
  }, [id, ownerId, tenantId, selected, retry, onDenied]);
  return <section aria-label="私人草稿版本歷史">
    <button type="button" onClick={() => setOpen(v => !v)}>{open ? '收起版本歷史' : '查看版本歷史'}</button>
    {open && <>
      {error && <p role="alert">{error}<button type="button" onClick={() => setRetry(v => v + 1)}>重試歷史</button></p>}
      {!rows ? <p role="status">讀取版本中…</p> : <>{rows.map(row => <button key={row.revision} type="button" onClick={() => setSelected(row.revision)}>版本 {row.revision} · {row.createdAt}</button>)}
        <button type="button" disabled={page === 1} onClick={() => setPage(v => v - 1)}>版本上一頁</button>
        <button type="button" disabled={rows.length < 50} onClick={() => setPage(v => v + 1)}>版本下一頁</button></>}
      {version && <><p>歷史版本 {version.revision}，僅供核對，不會覆蓋目前草稿。</p><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(version.payload,null,2)}</pre></>}
    </>}
  </section>;
}
