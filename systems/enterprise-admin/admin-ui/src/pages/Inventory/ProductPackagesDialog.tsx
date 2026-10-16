import { useEffect, useId, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import type { PackageIdentifier, PackageRevision, PackageRevisionInput } from '@pharmasaas/types';
import { productPackagesApi } from '../../api/productPackages';
import { useAuth } from '../../hooks/authContext';
import './ProductPackagesDialog.css';

const localTime = (value: string) => new Date(Date.parse(value) + 8 * 60 * 60 * 1000).toISOString().slice(0, 16);
const dateTime = (value: string) => new Date(value).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
function failure(error: unknown) {
  const status = isAxiosError(error) ? error.response?.status : undefined;
  if (status === 403) return '權限不足，請洽可維護商品的管理員。';
  if (status === 404) return '找不到商品或無法存取，請關閉後重新載入。';
  if (status === 409) return '版本或庫存單位已變更，草稿已保留。請重新載入歷史並核對，再重新選擇要修訂的版本。';
  if (status === 400) return '資料格式有誤，請核對 GTIN 校驗位、完整有效時間、重複識別碼與必填欄位。草稿已保留。';
  return '操作未確認成功，請保留草稿並重新讀取歷史，核對是否已寫入後再決定是否重試。';
}

export default function ProductPackagesDialog({ productId, onClose }: { productId: string; onClose: () => void }) {
  const { user, loading, hasPermission } = useAuth();
  return <PackagePanel key={`${productId}:${user?.id}:${user?.permissions.join(',')}:${loading}`} productId={productId} onClose={onClose}
    userId={user?.id ?? ''} allowed={!loading && !!user && hasPermission('read:products')}
    editable={!loading && !!user && hasPermission('update:products')} />;
}

function PackagePanel({ productId, onClose, userId, allowed, editable }: {
  productId: string; onClose: () => void; userId: string; allowed: boolean; editable: boolean;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const mounted = useRef(false);
  const writing = useRef(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [target, setTarget] = useState<{ packageId: string; revision: number; expectedRetired: boolean } | null>(null);
  const [form, setForm] = useState({ label: '', contents: '', stockUnitLabel: '', units: '', source: '', reason: '',
    validFrom: localTime(new Date().toISOString()), validUntil: '' });
  const [identifiers, setIdentifiers] = useState<PackageIdentifier[]>([{ namespace: 'MANUFACTURER', value: '' }]);
  const [retirementReason, setRetirementReason] = useState('');
  const [mustReview, setMustReview] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const history = useQuery({
    queryKey: ['product-packages', userId, productId], queryFn: ({ signal }) => productPackagesApi.list(productId, signal),
    enabled: allowed, retry: false, staleTime: 0, gcTime: 0,
  });
  useEffect(() => {
    mounted.current = true;
    const node = dialog.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (node?.showModal) node.showModal(); else node?.setAttribute('open', '');
    return () => { mounted.current = false; node?.close?.(); if (opener?.isConnected && !opener.matches(':disabled')) opener.focus(); };
  }, []);
  const available = allowed && history.isSuccess && !history.isFetching && !history.isError;
  const canWrite = available && editable && !pending && !mustReview && !needsRefresh;
  function editRevision(row: PackageRevision) {
    if (!available || pending || needsRefresh) return;
    setTarget({ packageId: row.packageId, revision: row.revision, expectedRetired: row.retiredAt !== null });
    setForm({ label: row.label, contents: row.contents, stockUnitLabel: history.data?.product.stockUnitLabel ?? '',
      units: row.unitsPerPackage === null ? '' : String(row.unitsPerPackage), source: row.source, reason: '',
      validFrom: localTime(new Date().toISOString()), validUntil: '' });
    setIdentifiers(row.identifiers.map(({ namespace, value }) => ({ namespace, value })));
    setMessage('已複製至新 revision 草稿；舊紀錄保留。請覆核來源、原因與有效期。');
    setMustReview(false);
    document.getElementById(`${id}-label`)?.focus();
  }
  async function refreshHistory() {
    setMustReview(true); setNeedsRefresh(true);
    const result = await history.refetch();
    if (mounted.current && result.isSuccess) setNeedsRefresh(false);
  }
  async function write(work: () => Promise<unknown>) {
    if (!canWrite || writing.current) return;
    writing.current = true; setPending(true); setNeedsRefresh(true); setMessage('正在儲存，請等待確認…');
    try {
      await work();
      if (!mounted.current) return;
      setMessage('已儲存。請核對更新後的包裝歷史。'); setMustReview(true);
      await refreshHistory();
    } catch (error) { if (mounted.current) { setMessage(failure(error)); setMustReview(true); } }
    finally { writing.current = false; if (mounted.current) setPending(false); }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    let data: PackageRevisionInput;
    try {
      data = { label: form.label, contents: form.contents,
        stockUnitLabel: history.data?.product.stockUnitLabel ?? form.stockUnitLabel,
        unitsPerPackage: form.units === '' ? null : Number(form.units), source: form.source, reason: form.reason,
        validFrom: new Date(`${form.validFrom}+08:00`).toISOString(),
        validUntil: form.validUntil ? new Date(`${form.validUntil}+08:00`).toISOString() : null, identifiers };
    } catch { setMessage('請填寫完整有效時間（台北時間）。'); return; }
    await write(() => target
      ? productPackagesApi.revise(productId, target.packageId, target.revision, data, target.expectedRetired)
      : productPackagesApi.create(productId, data));
  }
  function newPackage() {
    if (!available || pending || needsRefresh) return;
    setTarget(null); setMustReview(false); setMessage('新增獨立包裝；請勿以新增包裝代替修訂既有包裝。');
    setForm({ label: '', contents: '', stockUnitLabel: history.data?.product.stockUnitLabel ?? '', units: '', source: '', reason: '',
      validFrom: localTime(new Date().toISOString()), validUntil: '' });
    setIdentifiers([{ namespace: 'MANUFACTURER', value: '' }]);
  }
  return <dialog ref={dialog} className="receipt-dialog product-packages-dialog" aria-modal="true" aria-labelledby={`${id}-title`}
    onCancel={event => { event.preventDefault(); if (!writing.current) onClose(); }}>
    <header><h2 id={`${id}-title`}>商品／包裝對照</h2><button type="button" className="btn btn-ghost" disabled={pending} onClick={onClose}>關閉包裝維護</button></header>
    <p>店內人工覆核；識別碼保留原文。有效時間含起點、不含終點。停用後請建立新 revision，舊紀錄保留。此處不變更庫存或售價。</p>
    {!allowed ? <p role="alert">無權讀取商品包裝。</p> : history.isPending || history.isFetching ? <p role="status">正在讀取包裝歷史…</p>
      : history.isError ? <p role="alert">{failure(history.error)}</p> : <>
        <h3>{history.data.product.name} · SKU {history.data.product.sku}</h3>
        <p>已覆核庫存計量單位：{history.data.product.stockUnitLabel ?? '尚未設定（首筆對照時確認）'}</p>
        {history.data.packages.length === 0 && <p>尚無包裝對照。</p>}
        <ul className="package-history">{history.data.packages.map(item => <li key={item.id}>
          <h4>包裝 {item.id} · 最新 revision {item.revision}</h4>
          {item.revisions.map(row => <details key={row.id} open={row.revision === item.revision}>
            <summary>{row.label} · revision {row.revision} · {row.retiredAt ? '已停用' : '未停用（仍須符合有效期）'}</summary>
            <p>{row.contents} · {row.unitsPerPackage === null ? '換算未知，禁止加車' : `1 包裝 = ${row.unitsPerPackage} ${history.data.product.stockUnitLabel}`}</p>
            <p>有效期：{dateTime(row.validFrom)}（含） → {row.validUntil ? dateTime(row.validUntil) : '不限'}（不含）；台北時間</p>
            <p>來源：{row.source} · 覆核原因：{row.reason} · 覆核者：{row.actorId} · {dateTime(row.createdAt)}</p>
            <ul>{row.identifiers.map((identifier, index) => <li key={index}>{identifier.namespace} <code>{JSON.stringify(identifier.value)}</code></li>)}</ul>
            {row.retiredAt && <p>停用：{dateTime(row.retiredAt)} · {row.retiredById} · {row.retirementReason}</p>}
            {row.revision === item.revision && editable && <div className="package-actions">
              <button type="button" className="btn btn-ghost" disabled={pending || needsRefresh || !available} onClick={() => editRevision(row)}>以 revision {row.revision} 建立新版本</button>
              {!row.retiredAt && <button type="button" className="btn btn-ghost" disabled={!canWrite || !retirementReason.trim()}
                onClick={() => void write(() => productPackagesApi.retire(productId, item.id, row.revision, retirementReason))}>停用此 revision</button>}
            </div>}
          </details>)}
        </li>)}</ul>
      </>}
    <button type="button" className="btn btn-ghost" disabled={pending || history.isFetching || !allowed} onClick={() => void refreshHistory()}>重新載入歷史</button>
    <p role="status" aria-live="polite">{message}</p>
    {editable && <>
      <label htmlFor={`${id}-retirement`}>停用原因（停用前必填）</label><textarea id={`${id}-retirement`} value={retirementReason} disabled={pending} maxLength={1000} onChange={event => setRetirementReason(event.target.value)} />
      <button type="button" className="btn btn-ghost" disabled={pending || needsRefresh || !available} onClick={newPackage}>新增獨立包裝</button>
      {mustReview && <p>請先重新讀取歷史並核對結果，再按「建立新版本」或「新增獨立包裝」繼續。原草稿仍保留。</p>}
      <form onSubmit={event => void save(event)} aria-label="包裝覆核草稿">
        <h3>{target ? `建立新 revision（原版本 ${target.revision}）` : '新增包裝草稿'}</h3>
        <fieldset disabled={!canWrite}>
          <div className="package-form-grid">{([
            ['label', '包裝名稱'], ['contents', '規格／劑型／內容量（供辨識差異）'],
            ['stockUnitLabel', '商品既有庫存計量單位'], ['source', '權威資料來源／文件版本'], ['reason', '人工覆核原因'],
          ] as const).map(([key, label]) => <label key={key} htmlFor={`${id}-${key}`}>{label}
            <input id={`${id}-${key}`} className="input-field" value={key === 'stockUnitLabel' && history.data?.product.stockUnitLabel ? history.data.product.stockUnitLabel : form[key]}
              readOnly={key === 'stockUnitLabel' && !!history.data?.product.stockUnitLabel} required maxLength={key === 'stockUnitLabel' ? 80 : 1000}
              onChange={event => setForm({ ...form, [key]: event.target.value })} /></label>)}
            <label>每包裝對應的庫存數量（未知請留空）<input className="input-field" type="number" min="1" max="2147483647" step="1" value={form.units} onChange={event => setForm({ ...form, units: event.target.value })} /></label>
            <label>有效起點（台北時間，含）<input className="input-field" type="datetime-local" required value={form.validFrom} onChange={event => setForm({ ...form, validFrom: event.target.value })} /></label>
            <label>有效終點（台北時間，不含；可留空）<input className="input-field" type="datetime-local" value={form.validUntil} onChange={event => setForm({ ...form, validUntil: event.target.value })} /></label>
          </div>
          <h4>原廠識別碼／GTIN（多碼可對應同一包裝）</h4>
          {identifiers.map((identifier, index) => <div className="package-identifier" key={index}>
            <label>種類 {index + 1}<select aria-label={`識別碼種類 ${index + 1}`} value={identifier.namespace} onChange={event => setIdentifiers(identifiers.map((item, i) => i === index ? { ...item, namespace: event.target.value as PackageIdentifier['namespace'] } : item))}>
              <option value="MANUFACTURER">原廠碼</option><option value="GTIN">GTIN</option></select></label>
            <label>識別碼 {index + 1}<textarea aria-label={`識別碼 ${index + 1}`} value={identifier.value} maxLength={256} required
              onChange={event => setIdentifiers(identifiers.map((item, i) => i === index ? { ...item, value: event.target.value } : item))}
              onPaste={event => { event.preventDefault(); const value = event.clipboardData.getData('text/plain'); setIdentifiers(identifiers.map((item, i) => i === index ? { ...item, value } : item)); }} />
              <code aria-label={`識別碼 ${index + 1} 原文`}>{JSON.stringify(identifier.value)}</code></label>
            <button type="button" className="btn btn-ghost" disabled={identifiers.length === 1} onClick={() => setIdentifiers(identifiers.filter((_, i) => i !== index))}>移除識別碼 {index + 1}</button>
          </div>)}
          <p>識別碼貼上會取代整段內容；引號內為 JSON 原文表示，請核對前後空白與跳脫字元。</p>
          <button type="button" className="btn btn-ghost" disabled={identifiers.length >= 50} onClick={() => setIdentifiers([...identifiers, { namespace: 'MANUFACTURER', value: '' }])}>新增識別碼</button>
          <button type="submit" className="btn btn-primary">{pending ? '儲存中…' : '確認覆核並儲存新 revision'}</button>
        </fieldset>
      </form>
    </>}
  </dialog>;
}
