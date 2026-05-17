export type PaymentMethod = 'CASH' | 'CARD' | 'LINE_PAY' | 'TRANSFER' | 'OTHER';

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  CASH: '現金',
  CARD: '信用卡',
  LINE_PAY: 'LINE Pay',
  TRANSFER: '轉帳',
  OTHER: '其他',
};
