import { useCallback, useEffect, useRef, useState } from 'react';
import { useBlocker, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/authContext';
import type { User } from '../../hooks/authContext';
import api from '../../api/client';
import { receivingDraftsApi, draftPayload, restoreDraft, payloadKey } from '../../api/receivingDrafts';
import type { SavedReceivingDraft, ReceivingDraftList } from '../../api/receivingDrafts';
import { createDraft } from '../../domain/receiptDraft';
import { createReceiptWorkspace } from '../../domain/receiptDraftWorkspace';
import type { OpenWorkspace, WorkspaceCommand } from '../../domain/receiptDraftWorkspace';
import ReceiptDraftEditor from './ReceiptDraftEditor';
import ReceiptDraftHistory from './ReceiptDraftHistory';
import type { ReceiptProductOption } from './ReceiptDraftEditor';

const sessions = new WeakMap<User, number>();
let sessionSequence = 0;
function sessionKey(user: User) {
  let value = sessions.get(user);
  if (value === undefined) { value = ++sessionSequence; sessions.set(user, value); }
  return value;
}
function status(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('response' in error)) return;
  const response = error.response;
  return typeof response === 'object' && response !== null && 'status' in response && typeof response.status === 'number' ? response.status : undefined;
}
export default function ReceivingDraftPage() {
  const { user, loading, hasPermission } = useAuth();
  if (loading) return <p role="status">確認登入中…</p>;
  if (!user || !hasPermission('read:products')) return <p role="alert">無權限讀取收貨草稿。</p>;
  // A new authenticated profile is a new owner generation, including same-user re-login.
  return <ReceivingSession key={sessionKey(user)} ownerId={user.id} editable={hasPermission('create:products')} />;
}

function ReceivingSession({ ownerId, editable }: { ownerId: string; editable: boolean }) {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('draft');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<ReceivingDraftList | null>(null);
  const [listError, setListError] = useState('');
  const [listLoading, setListLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [openRetry, setOpenRetry] = useState(0);
  const [view, setView] = useState<OpenWorkspace | null>(null);
  const workspace = useRef(createReceiptWorkspace());
  const [title, setTitle] = useState('人工收貨草稿');
  const [serverRevision, setServerRevision] = useState(0);
  const [savedJson, setSavedJson] = useState('');
  const [pending, setPending] = useState(false);
  const writing = useRef(false);
  const [uncertain, setUncertain] = useState(false);
  const [message, setMessage] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [remote, setRemote] = useState<SavedReceivingDraft | null>(null);
  const generation = useRef(0);
  const allowNavigation = useRef(false);
  const savedUrl = useRef<string | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const live = useRef(true);
  const [products, setProducts] = useState<ReceiptProductOption[]>([]);
  const [productPage, setProductPage] = useState(1);
  const [productTotal, setProductTotal] = useState(0);
  const [productState, setProductState] = useState<'loading' | 'ready' | 'error'>('loading');
  const payload = view ? draftPayload(title, view.draft) : null;
  const dirty = !!payload && payloadKey(payload) !== savedJson;
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (allowNavigation.current) { allowNavigation.current = false; return false; }
    return !blocked && (dirty || pending || uncertain) && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search);
  });
  const deny = useCallback(() => { setBlocked(true); setView(null); setRemote(null); }, []);
  const scope = list ? { tenantId: list.tenantId, actorId: ownerId } : null;

  useEffect(() => {
    live.current = true;
    return () => { live.current = false; generation.current++; workspace.current.close(workspace.current.getSnapshot()); };
  }, []);
  useEffect(() => {
    if (!dirty && !pending && !uncertain) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, pending, uncertain]);
  useEffect(() => {
    const controller = new AbortController();
    setListLoading(true); setListError('');
    receivingDraftsApi.list(page, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      if (result.ownerId !== ownerId || !result.tenantId || !Array.isArray(result.data)) throw { response: { status: 403 } };
      setList(result); setListLoading(false);
    }).catch(error => {
      if (controller.signal.aborted) return;
      setListLoading(false);
      if ([401, 403].includes(status(error) ?? 0)) { setBlocked(true); setView(null); setRemote(null); }
      setListError('草稿清單讀取失敗，沒有顯示成空清單。');
    });
    return () => controller.abort();
  }, [ownerId, page, retry]);
  useEffect(() => {
    const controller = new AbortController(); setProductState('loading');
    api.get('/inventory/products', { params: { page: String(productPage) }, signal: controller.signal }).then(response => {
      if (controller.signal.aborted) return;
      const data = response.data.data;
      if (!Array.isArray(data.data) || typeof data.total !== 'number') throw new Error('Product response invalid');
      setProducts(data.data); setProductTotal(data.total); setProductState('ready');
    }).catch(error => { if (!controller.signal.aborted) { setProducts([]); setProductState('error'); if ([401, 403].includes(status(error) ?? 0)) { setBlocked(true); setView(null); setRemote(null); } } });
    return () => controller.abort();
  }, [productPage, retry]);
  useEffect(() => {
    if (selectedId && savedUrl.current === selectedId && !blocked) { savedUrl.current = null; return; }
    const current = ++generation.current;
    setDiscarding(false); setPending(false);
    setView(null); setRemote(null); setUncertain(false); setMessage('');
    workspace.current.close(workspace.current.getSnapshot());
    if (!selectedId || !list || blocked) return;
    const rawId = selectedId.startsWith('new-') ? selectedId.slice(4) : selectedId;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawId)) { setMessage('草稿連結格式無效，請回到清單重新選取。'); return; }
    if (selectedId.startsWith('new-')) {
      setView(workspace.current.open(workspace.current.getSnapshot(), { tenantId: list.tenantId, actorId: ownerId }, createDraft(selectedId.slice(4))));
      setTitle('人工收貨草稿'); setServerRevision(0); setSavedJson(''); setPending(false);
      return;
    }
    const controller = new AbortController();
    setPending(true);
    receivingDraftsApi.get(selectedId, controller.signal).then(result => {
      if (controller.signal.aborted || current !== generation.current) return;
      if (result.ownerId !== ownerId || result.tenantId !== list.tenantId) throw { response: { status: 403 } };
      const opened = workspace.current.open(workspace.current.getSnapshot(), { tenantId: result.tenantId, actorId: ownerId }, restoreDraft(result));
      setView(opened); setTitle(result.payload.title); setServerRevision(result.revision); setSavedJson(payloadKey(result.payload));
    }).catch(error => {
      if (controller.signal.aborted || current !== generation.current) return;
      if ([401, 403].includes(status(error) ?? 0)) setBlocked(true);
      setMessage('草稿讀取失敗，請重試或回到清單；沒有建立替代草稿。');
    }).finally(() => { if (!controller.signal.aborted && current === generation.current) setPending(false); });
    return () => controller.abort();
  // List page reloads must not erase unsaved work. Only its authenticated scope controls opening.
  }, [selectedId, list?.tenantId, ownerId, blocked, openRetry]);

  function install(result: SavedReceivingDraft) {
    if (!scope || result.ownerId !== ownerId || result.tenantId !== scope.tenantId) throw { response: { status: 403 } };
    setView(workspace.current.open(workspace.current.getSnapshot(), scope, restoreDraft(result)));
    setTitle(result.payload.title); setServerRevision(result.revision); setSavedJson(payloadKey(result.payload));
    if (selectedId !== result.id) { savedUrl.current = result.id; allowNavigation.current = true; setParams({ draft: result.id }, { replace: true }); }
    setRetry(value => value + 1);
  }
  function fresh() {
    if (!scope || blocked || pending || dirty || !editable) return;
    setParams({ draft: 'new-' + crypto.randomUUID() });
  }
  function dispatch(command: WorkspaceCommand) {
    if (!view || !editable || pending || uncertain || blocked) return;
    try { setView(workspace.current.dispatch(view, command)); setMessage(''); }
    catch { setMessage('草稿版本已變更，沒有套用過期操作。'); }
  }
  async function save() {
    if (!view || !payload || !editable || pending || writing.current || uncertain || blocked || !dirty) return;
    const current = generation.current;
    writing.current = true; setPending(true); setMessage('保存中，請等待確認…');
    try {
      const result = await receivingDraftsApi.save(view.draft.id, serverRevision, payload);
      if (!live.current || current !== generation.current) return;
      install(result); setMessage('草稿已保存，尚未入庫。');
      // Keep this owner in place; the URL enables reopening the saved record after reload.

    } catch (error) {
      if (!live.current || current !== generation.current) return;
      if ([401, 403].includes(status(error) ?? 0)) { setBlocked(true); setView(null); setRemote(null); }
      else { setUncertain(true); setMessage('保存未確認或版本衝突。草稿保留，請先查回伺服器版本，禁止直接重送。'); }
    } finally { writing.current = false; if (live.current && current === generation.current) setPending(false); }
  }
  async function recover() {
    if (!view || pending || blocked) return;
    const current = generation.current; setPending(true); setRemote(null);
    try {
      const result = await receivingDraftsApi.get(view.draft.id, new AbortController().signal);
      if (!live.current || current !== generation.current) return;
      if (!scope || result.ownerId !== ownerId || result.tenantId !== scope.tenantId) throw { response: { status: 403 } };
      if (payloadKey(result.payload) === payloadKey(draftPayload(title, view.draft))) {
        install(result); setUncertain(false); setMessage('查回內容與本次草稿完全一致，已確認保存，沒有再次送出。');
      } else { setRemote(result); setMessage('伺服器內容不同，尚未覆蓋任何一方。請核對下方版本後明確選擇。'); }
    } catch (error) {
      if (!live.current || current !== generation.current) return;
      if ([401, 403].includes(status(error) ?? 0)) { setBlocked(true); setView(null); setRemote(null); }
      else if (status(error) === 404 && serverRevision === 0) { setUncertain(false); setMessage('伺服器尚無此草稿；保留相同草稿 ID，可再次保存。'); }
      else setMessage('查回失敗，仍未確認保存。請保留此頁再查回。');
    } finally { if (live.current && current === generation.current) setPending(false); }
  }
  if (blocked) return <p role="alert">登入或權限已變更，已隱藏草稿。請重新登入後開啟。</p>;
  return <main className="receipt-draft-editor">
    <h1>人工收貨草稿</h1>
    {blocker.state === 'blocked' && <section role="dialog" aria-label="離開草稿確認">
      <p>{pending || uncertain ? '保存仍在處理或尚未確認，請留在此頁查回結果。' : '離開會放棄本頁未保存變更，已保存版本保留。'}</p>
      <button type="button" onClick={() => blocker.reset()}>留在草稿</button>
      <button type="button" disabled={pending || uncertain} onClick={() => blocker.proceed()}>放棄未保存變更並離開</button>
    </section>}
    <p>只限目前登入人員的私人草稿。按「保存草稿」才寫入；離開前請保存。沒有入庫、庫存放行或付款操作。</p>
    {listLoading && <p role="status">載入我的草稿…</p>}
    {listError && <p role="alert">{listError}<button type="button" onClick={() => setRetry(n => n + 1)}>重試清單</button></p>}
    <button type="button" disabled={!scope || pending || dirty || !editable} onClick={fresh}>新增私人草稿</button>
    {list && <section aria-label="已保存草稿">
      {list.data.length === 0 ? <p>尚無已保存草稿。</p> : list.data.map(row => <button key={row.id} type="button" disabled={pending || dirty}
        onClick={() => setParams({ draft: row.id })}>{row.title} · v{row.revision}</button>)}
      <p>第 {page} 頁，共 {list.total} 份。</p>
      <button type="button" disabled={page <= 1 || pending || dirty} onClick={() => setPage(p => p - 1)}>草稿上一頁</button>
      <button type="button" disabled={page * 50 >= list.total || pending || dirty} onClick={() => setPage(p => p + 1)}>草稿下一頁</button>
    </section>}
    {selectedId && !view && !pending && <button type="button" onClick={() => setParams({})}>回到草稿清單</button>}
    {selectedId && !view && !pending && <button type="button" onClick={() => setOpenRetry(n => n + 1)}>重試開啟草稿</button>}
    {message && <p role={uncertain ? 'alert' : 'status'}>{message}</p>}
    {view && <>
      <button type="button" disabled={pending || uncertain} onClick={() => dirty ? setDiscarding(true) : setParams({})}>關閉本頁草稿</button>
      {discarding && <section role="dialog" aria-label="確認放棄未保存內容"><p>只放棄本頁未保存內容，已保存版本保留。</p><button type="button" onClick={() => { allowNavigation.current = true; setParams({}); }}>確認放棄未保存內容</button><button type="button" onClick={() => setDiscarding(false)}>繼續編輯</button></section>}
      {serverRevision > 0 && scope && <ReceiptDraftHistory key={view.draft.id} id={view.draft.id} ownerId={ownerId} tenantId={scope.tenantId} revision={serverRevision} onDenied={deny} />}
      <label>草稿名稱<input value={title} maxLength={120} disabled={!editable || pending || uncertain} onChange={event => setTitle(event.target.value)} /></label>
      <p>伺服器版本 {serverRevision} · {dirty ? '有未保存變更' : '已保存'}</p>
      <p>商品第 {productPage} 頁（每頁最多 50 筆）。請明確選取，查無資料不自動建立商品。</p>
      <button type="button" disabled={productPage <= 1 || pending} onClick={() => setProductPage(p => p - 1)}>商品上一頁</button>
      <button type="button" disabled={productPage * 50 >= productTotal || pending} onClick={() => setProductPage(p => p + 1)}>商品下一頁</button>
      <ReceiptDraftEditor draft={view.draft} products={products} productsState={productState} disabled={!editable || pending || uncertain}
        dispatch={dispatch} onProductsRetry={() => setRetry(n => n + 1)} />
      <button type="button" disabled={!editable || pending || uncertain || !dirty || !title.trim()} onClick={() => void save()}>保存草稿</button>
      {uncertain && <button type="button" disabled={pending} onClick={() => void recover()}>查回保存結果</button>}
      {remote && <section aria-label="伺服器版本比較">
        <h2>伺服器版本 {remote.revision}：{remote.payload.title}</h2>
        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(remote.payload, null, 2)}</pre>
        <button type="button" disabled={pending} onClick={() => { install(remote); setRemote(null); setUncertain(false); setMessage('已明確採用伺服器版本。'); }}>放棄本頁未保存內容，採用伺服器版本</button>
        <button type="button" disabled={pending} onClick={() => { setServerRevision(remote.revision); setRemote(null); setUncertain(false); setMessage('保留本頁內容，請重新核對後明確保存為下一版。'); }}>保留本頁內容，準備另存下一版</button>
      </section>}
    </>}
  </main>;
}
