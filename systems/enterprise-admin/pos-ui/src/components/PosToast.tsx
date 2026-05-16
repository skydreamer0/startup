export type PosToastType = 'success' | 'error' | 'warning' | 'info';

export interface PosToastMessage {
  type: PosToastType;
  message: string;
}

interface Props {
  toast: PosToastMessage | null;
  onDismiss?: () => void;
}

const COLORS: Record<PosToastType, { bg: string; border: string; text: string }> = {
  success: { bg: 'var(--success-bg)', border: 'var(--success)', text: 'var(--text-primary)' },
  error: { bg: 'var(--danger-bg)', border: 'var(--danger)', text: 'var(--text-primary)' },
  warning: { bg: 'var(--warning-bg)', border: 'var(--warning)', text: 'var(--text-primary)' },
  info: { bg: 'var(--info-bg)', border: 'var(--info)', text: 'var(--text-primary)' },
};

export default function PosToast({ toast, onDismiss }: Props) {
  if (!toast) return null;

  const color = COLORS[toast.type];

  return (
    <div
      role={toast.type === 'error' ? 'alert' : 'status'}
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        zIndex: 2000,
        maxWidth: 360,
        padding: '12px 14px',
        borderRadius: 'var(--radius-sm)',
        border: `1px solid ${color.border}`,
        background: color.bg,
        color: color.text,
        boxShadow: 'var(--shadow-md)',
        fontSize: 14,
        fontWeight: 600,
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
      }}
    >
      <span style={{ flex: 1 }}>{toast.message}</span>
      {onDismiss && (
        <button
          type="button"
          aria-label="關閉訊息"
          onClick={onDismiss}
          style={{
            border: 'none',
            background: 'transparent',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: 16,
            lineHeight: 1,
            padding: 0,
          }}
        >
          x
        </button>
      )}
    </div>
  );
}
