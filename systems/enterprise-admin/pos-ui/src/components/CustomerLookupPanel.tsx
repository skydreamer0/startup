import { FormEvent, useLayoutEffect, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import { useCartStore } from '../store/cartStore';
import { useCheckoutRecoveryStore } from '../store/checkoutRecoveryStore';
import { posApi } from '../api/pos';
import type { PosCustomerLookup } from '../api/pos';
import type { PosToastMessage } from './PosToast';

interface Props {
  selectedCustomer: PosCustomerLookup | null;
  onSelect: (customer: PosCustomerLookup) => void;
  onClear?: () => void;
  onFeedback: (message: PosToastMessage) => void;
}

const SEGMENT_LABELS: Record<PosCustomerLookup['rfmSegment'], string> = {
  vip: 'VIP',
  loyal: '忠誠',
  new: '新客',
  at_risk: '流失風險',
};

const SEGMENT_COLORS: Record<PosCustomerLookup['rfmSegment'], { bg: string; text: string; border: string }> = {
  vip: { bg: '#FEF3C7', text: '#92400E', border: '#F59E0B' },
  loyal: { bg: '#DCFCE7', text: '#166534', border: '#22C55E' },
  new: { bg: '#E0F2FE', text: '#075985', border: '#38BDF8' },
  at_risk: { bg: '#FEE2E2', text: '#991B1B', border: '#EF4444' },
};

type LookupMode = 'idle' | 'searching' | 'not_found' | 'creating' | 'selected';

function formatCurrency(value: number) {
  return `$${value.toLocaleString('en-US')}`;
}

function feedbackFor(customer: PosCustomerLookup): PosToastMessage {
  const name = customer.name ?? customer.phone ?? '客戶';
  if (customer.rfmSegment === 'vip') {
    return { type: 'success', message: `VIP 客戶 ${name}，累計消費 ${formatCurrency(customer.totalSpent)}` };
  }
  if (customer.rfmSegment === 'at_risk') {
    return { type: 'warning', message: `90 天未回購，請關懷 ${name}` };
  }
  return { type: 'info', message: `已識別客戶 ${name}` };
}

export default function CustomerLookupPanel({ selectedCustomer, onSelect, onClear, onFeedback }: Props) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<LookupMode>('idle');
  const [createPhone, setCreatePhone] = useState('');
  const [createName, setCreateName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const requestGeneration = useRef(0);
  const mounted = useRef(false);

  function invalidateRequest() {
    requestGeneration.current += 1;
    setQuery(''); setCreatePhone(''); setCreateName('');
    setMode('idle'); setIsSubmitting(false);
  }

  useLayoutEffect(() => {
    mounted.current = true;
    // Subscribe synchronously: even a pending/scope ABA invalidates an old
    // response permanently, without relying on a later React render.
    const unsubscribeCart = useCartStore.subscribe((next, previous) => {
      if (next.draftRevision !== previous.draftRevision || next.draftScope !== previous.draftScope
        || next.customerId !== previous.customerId || next.selectedCustomer !== previous.selectedCustomer) invalidateRequest();
    });
    const unsubscribeRecovery = useCheckoutRecoveryStore.subscribe((next, previous) => {
      if (next.scope !== previous.scope || next.pending !== previous.pending) invalidateRequest();
    });
    return () => { mounted.current = false; requestGeneration.current += 1; unsubscribeCart(); unsubscribeRecovery(); };
  }, []);
  useLayoutEffect(invalidateRequest, [selectedCustomer]);

  function startRequest() {
    if (useCheckoutRecoveryStore.getState().pending) return null;
    return { generation: ++requestGeneration.current, scope: useCheckoutRecoveryStore.getState().scope };
  }
  function isCurrent(request: { generation: number; scope: string | null }) {
    return mounted.current && requestGeneration.current === request.generation
      && useCheckoutRecoveryStore.getState().scope === request.scope
      && !useCheckoutRecoveryStore.getState().pending;
  }

  const customer = selectedCustomer;
  const segmentColor = customer ? SEGMENT_COLORS[customer.rfmSegment] : null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    const request = startRequest();
    if (!request) return;
    setMode('searching');
    try {
      const response = await posApi.lookupCustomer(trimmed);
      if (!isCurrent(request)) return;
      const found = response.data.data;
      if (!found) {
        setCreatePhone(trimmed);
        setCreateName('');
        setMode('not_found');
        return;
      }
      setMode('selected');
      onSelect(found);
      onFeedback(feedbackFor(found));
    } catch {
      if (!isCurrent(request)) return;
      setMode('idle');
      onFeedback({ type: 'error', message: '客戶查詢失敗，請稍後再試' });
    }
  }

  async function handleCreateCustomer(event: FormEvent) {
    event.preventDefault();
    const phone = createPhone.trim();
    const name = createName.trim();
    if (!phone) return;

    const request = startRequest();
    if (!request) return;
    setIsSubmitting(true);
    try {
      const response = await posApi.createCustomer({ phone, name: name || undefined });
      if (!isCurrent(request)) {
        // The server write may have completed. Detaching it from an obsolete
        // draft is not cancellation; never show a stale identity's name/phone.
        if (mounted.current && useCheckoutRecoveryStore.getState().scope === request.scope) {
          onFeedback({ type: 'info', message: '客戶已建立，但未套用至目前交易；請重新查詢' });
        }
        return;
      }
      const created = response.data.data;
      setQuery(phone);
      setMode('selected');
      onSelect(created);
      onFeedback({
        type: 'success',
        message: `已建立新客戶：${created.name ?? created.phone ?? phone}`,
      });
    } catch (error: unknown) {
      if (!isCurrent(request)) {
        if (mounted.current && useCheckoutRecoveryStore.getState().scope === request.scope) {
          onFeedback({ type: 'warning', message: '客戶建立結果未套用至目前交易；請重新查詢確認' });
        }
        return;
      }
      if (isAxiosError(error) && error.response?.status === 409) {
        onFeedback({ type: 'error', message: '此電話已有客戶紀錄，請直接查詢' });
      } else {
        onFeedback({ type: 'error', message: '建立失敗，請稍後再試' });
      }
    } finally {
      if (isCurrent(request)) setIsSubmitting(false);
    }
  }

  function cancelCreate() {
    setCreatePhone('');
    setCreateName('');
    setMode('idle');
  }

  function clearCustomer() {
    requestGeneration.current += 1;
    setQuery('');
    setCreatePhone('');
    setCreateName('');
    setMode('idle');
    onClear?.();
  }

  const isSearching = mode === 'searching';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 360 }}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <label htmlFor="customer-lookup-input" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)' }}>
          客戶查詢
        </label>
        <input
          id="customer-lookup-input"
          value={query}
          disabled={isSubmitting}
          onChange={(event) => {
            requestGeneration.current += 1;
            setQuery(event.target.value);
            setMode('idle');
          }}
          placeholder="電話 / 會員碼"
          style={{ width: 150, padding: '8px 12px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-full)', fontSize: 12, background: 'var(--bg-app)', outline: 'none', color: 'var(--text-primary)' }}
        />
        <button
          type="submit"
          aria-label="查詢客戶"
          disabled={isSearching || isSubmitting}
          style={{ border: '1.5px solid var(--border)', background: 'var(--surface)', borderRadius: 'var(--radius-full)', padding: '7px 12px', cursor: isSearching ? 'wait' : 'pointer', fontSize: 12, color: 'var(--text-secondary)', fontWeight: 700 }}
        >
          {isSearching ? '查詢中' : '查詢'}
        </button>
      </form>

      {mode === 'not_found' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-full)', background: 'var(--bg-app)', color: 'var(--text-secondary)', fontSize: 12 }}>
          <span style={{ whiteSpace: 'nowrap' }}>此電話無紀錄</span>
          <button
            type="button"
            onClick={() => setMode('creating')}
            style={{ border: '1.5px solid var(--border)', background: 'var(--surface)', borderRadius: 'var(--radius-full)', padding: '5px 10px', cursor: 'pointer', color: 'var(--text-primary)', fontSize: 12, fontWeight: 700 }}
          >
            新增客戶
          </button>
        </div>
      )}

      {mode === 'creating' && (
        <form onSubmit={handleCreateCustomer} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            value={createPhone}
            onChange={(event) => setCreatePhone(event.target.value)}
            required
            disabled={isSubmitting}
            placeholder="電話"
            style={{ width: 130, padding: '8px 12px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-full)', fontSize: 12, background: 'var(--bg-app)', outline: 'none', color: 'var(--text-primary)', opacity: isSubmitting ? 0.5 : 1 }}
          />
          <input
            value={createName}
            onChange={(event) => setCreateName(event.target.value)}
            disabled={isSubmitting}
            placeholder="姓名（選填）"
            style={{ width: 130, padding: '8px 12px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-full)', fontSize: 12, background: 'var(--bg-app)', outline: 'none', color: 'var(--text-primary)', opacity: isSubmitting ? 0.5 : 1 }}
          />
          <button
            type="submit"
            disabled={isSubmitting}
            style={{ border: '1.5px solid var(--border)', background: 'var(--surface)', borderRadius: 'var(--radius-full)', padding: '7px 12px', cursor: isSubmitting ? 'wait' : 'pointer', fontSize: 12, color: 'var(--text-secondary)', fontWeight: 700 }}
          >
            {isSubmitting ? '建立中...' : '建立'}
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={cancelCreate}
            style={{ border: '1.5px solid var(--border)', background: 'transparent', borderRadius: 'var(--radius-full)', padding: '7px 12px', cursor: isSubmitting ? 'not-allowed' : 'pointer', fontSize: 12, color: 'var(--text-secondary)', fontWeight: 700 }}
          >
            取消
          </button>
        </form>
      )}

      {customer && segmentColor && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderRadius: 'var(--radius-full)', border: `1.5px solid ${segmentColor.border}`, background: segmentColor.bg, color: segmentColor.text, maxWidth: 260 }}>
          <span style={{ fontWeight: 800, fontSize: 12 }}>{SEGMENT_LABELS[customer.rfmSegment]}</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 84 }}>{customer.name ?? customer.phone}</span>
          <span style={{ fontSize: 11, whiteSpace: 'nowrap' }}>累計 {formatCurrency(customer.totalSpent)}</span>
          <button type="button" aria-label="清除客戶" onClick={clearCustomer} style={{ border: 'none', background: 'transparent', color: segmentColor.text, cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>
            x
          </button>
        </div>
      )}
    </div>
  );
}
