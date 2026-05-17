import { useEffect, useState } from 'react';
import { posApi, ActiveShift } from '../api/pos';
import { PosToastMessage } from '../components/PosToast';

function getCurrentUserId(): string | null {
  try {
    const token = localStorage.getItem('pos_accessToken');
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.userId ?? null;
  } catch {
    return null;
  }
}

export function useShift(
  showToast: (msg: PosToastMessage) => void,
  setSalesStaff: (id: string | null) => void,
) {
  const [activeShift, setActiveShift] = useState<ActiveShift | null>(null);
  const [openingCash, setOpeningCash] = useState(0);
  const [shiftOpening, setShiftOpening] = useState(false);
  const [showCloseShift, setShowCloseShift] = useState(false);
  const [closingCash, setClosingCash] = useState(0);
  const [shiftClosing, setShiftClosing] = useState(false);

  useEffect(() => {
    posApi.getActiveShift().then((response) => {
      const shift = response.data.data;
      setActiveShift(shift);
      if (shift) setSalesStaff(shift.staff.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleOpenShift() {
    const userId = getCurrentUserId();
    if (!userId) {
      showToast({ type: 'error', message: '找不到登入人員，請重新登入後再開班' });
      return;
    }

    setShiftOpening(true);
    try {
      const response = await posApi.openShift(userId, openingCash);
      const shift = response.data.data;
      setActiveShift(shift);
      setSalesStaff(shift.staff.id);
      showToast({ type: 'success', message: '班別已開啟' });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message;
      showToast({ type: 'error', message: msg ?? '開班失敗，請稍後再試' });
    } finally {
      setShiftOpening(false);
    }
  }

  async function handleCloseShift() {
    if (!activeShift) return;
    setShiftClosing(true);
    try {
      await posApi.closeShift(activeShift.id, closingCash);
      setActiveShift(null);
      setShowCloseShift(false);
      showToast({ type: 'success', message: '班別已關閉' });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message;
      showToast({ type: 'error', message: msg ?? '交班失敗，請稍後再試' });
    } finally {
      setShiftClosing(false);
    }
  }

  return {
    activeShift,
    setActiveShift,
    openingCash,
    setOpeningCash,
    shiftOpening,
    showCloseShift,
    setShowCloseShift,
    closingCash,
    setClosingCash,
    shiftClosing,
    handleOpenShift,
    handleCloseShift,
  };
}
