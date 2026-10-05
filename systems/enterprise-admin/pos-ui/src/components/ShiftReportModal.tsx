import { useQuery } from '@tanstack/react-query';
import { posApi, ShiftReport } from '../api/pos';
import { PAYMENT_LABELS, PaymentMethod } from '../constants';

interface Props {
  shiftId: string;
  onClose: () => void;
}

function ReportRow({ label, value, bold, danger }: { label: string; value: string; bold?: boolean; danger?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: bold ? 15 : 13 }}>
      <span style={{ color: 'var(--text-secondary)', fontWeight: bold ? 700 : 400 }}>{label}</span>
      <span style={{ fontWeight: bold ? 800 : 500, color: danger ? 'var(--danger)' : bold ? 'var(--accent)' : 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

function printReport(report: ShiftReport) {
  const lines = [
    '============================',
    '         班別報表',
    '============================',
    `員工：${report.staffName}`,
    `開班：${new Date(report.openedAt).toLocaleString('zh-TW')}`,
    report.closedAt ? `關班：${new Date(report.closedAt).toLocaleString('zh-TW')}` : '（班別進行中）',
    '----------------------------',
    `銷售筆數：${report.orderCount}`,
    `退款筆數：${report.refundCount}`,
    '----------------------------',
    `毛銷售額：$${report.grossSales.toFixed(0)}`,
    `折扣合計：-$${report.discountTotal.toFixed(0)}`,
    `退款合計：-$${report.refundTotal.toFixed(0)}`,
    `淨銷售額：$${report.netTotal.toFixed(0)}`,
    '----------------------------',
    '付款方式明細：',
    ...Object.entries(report.paymentBreakdown).map(
      ([method, amount]) => `  ${PAYMENT_LABELS[method as PaymentMethod] ?? method}：$${amount.toFixed(0)}`,
    ),
    '----------------------------',
    `開班現金：$${report.openingCash.toFixed(0)}`,
    `現金應在：$${report.cashBalance.toFixed(0)}`,
    report.closingCash != null ? `實際現金：$${report.closingCash.toFixed(0)}` : '',
    '============================',
  ].filter(Boolean).join('\n');

  const win = window.open('', '_blank', 'width=400,height=600');
  if (win) {
    win.document.write(`<pre style="font-family:monospace;font-size:13px;padding:16px">${lines}</pre>`);
    win.document.close();
    win.print();
    win.close();
  }
}

export default function ShiftReportModal({ shiftId, onClose }: Props) {
  const { data: report, isLoading, error } = useQuery({
    queryKey: ['shift-report', shiftId],
    queryFn: () => posApi.getShiftReport(shiftId).then((r) => r.data.data),
  });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', width: 440, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)' }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1.5px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16 }}>班別報表</h3>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{report ? (report.closedAt ? 'Z-Report（已關班）' : 'X-Report（班別進行中）') : ''}</div>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)' }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {isLoading && <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32, fontSize: 13 }}>載入中...</div>}
          {error && <div style={{ textAlign: 'center', color: 'var(--danger)', padding: 32, fontSize: 13 }}>載入失敗</div>}
          {report && (
            <>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>員工</div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{report.staffName}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  {new Date(report.openedAt).toLocaleString('zh-TW')}
                  {report.closedAt && ` → ${new Date(report.closedAt).toLocaleString('zh-TW')}`}
                </div>
              </div>

              <ReportRow label="銷售筆數" value={`${report.orderCount} 筆`} />
              <ReportRow label="退款筆數" value={`${report.refundCount} 筆`} danger={report.refundCount > 0} />

              <div style={{ marginTop: 12, marginBottom: 4, fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.05em' }}>銷售摘要</div>
              <ReportRow label="毛銷售額" value={`$${report.grossSales.toFixed(0)}`} />
              <ReportRow label="折扣合計" value={`-$${report.discountTotal.toFixed(0)}`} danger={report.discountTotal > 0} />
              <ReportRow label="退款合計" value={`-$${report.refundTotal.toFixed(0)}`} danger={report.refundTotal > 0} />
              <ReportRow label="淨銷售額" value={`$${report.netTotal.toFixed(0)}`} bold />

              <div style={{ marginTop: 12, marginBottom: 4, fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.05em' }}>付款方式</div>
              {Object.entries(report.paymentBreakdown).map(([method, amount]) => (
                <ReportRow key={method} label={PAYMENT_LABELS[method as PaymentMethod] ?? method} value={`$${amount.toFixed(0)}`} />
              ))}

              <div style={{ marginTop: 12, marginBottom: 4, fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.05em' }}>現金核對</div>
              <ReportRow label="開班現金" value={`$${report.openingCash.toFixed(0)}`} />
              <ReportRow label="現金應在" value={`$${report.cashBalance.toFixed(0)}`} bold />
              {report.closingCash != null && (
                <ReportRow
                  label="實際現金"
                  value={`$${report.closingCash.toFixed(0)}`}
                  danger={report.closingCash !== report.cashBalance}
                />
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {report && (
          <div style={{ padding: '14px 24px', borderTop: '1.5px solid var(--border)', display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={() => printReport(report)}
              style={{ flex: 1, padding: '11px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-card)', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
            >
              🖨 列印報表
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{ flex: 1, padding: '11px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}
            >
              關閉
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
