import { useEffect, useState } from 'react';
import { CancelledError, useQuery } from '@tanstack/react-query';
import { posApi } from '../api/pos';

const calendar = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
});

// Cache identity only: the server remains authoritative for order inclusion.
// Match the existing Asia/Taipei midnight calendar, not the terminal timezone.
function today() {
  const parts = calendar.formatToParts(new Date());
  const part = (type: string) => parts.find((value) => value.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function useTodayOrders(checkoutScope: string, shiftId?: string) {
  const [, setDay] = useState(today);
  // Re-read on every render too: a delayed timer must not expose yesterday.
  const day = today();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refreshDay = () => {
      clearTimeout(timer);
      const current = today();
      setDay(current);
      const midnight = Date.parse(`${current}T00:00:00+08:00`) + 86_400_000;
      // One timer, no API polling. The cap also notices terminal clock changes.
      timer = setTimeout(refreshDay, Math.max(1, Math.min(midnight - Date.now(), 60_000)));
    };
    const resume = () => {
      if (document.visibilityState !== 'hidden') refreshDay();
    };
    refreshDay();
    window.addEventListener('focus', resume);
    window.addEventListener('pageshow', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', resume);
      window.removeEventListener('pageshow', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, []);

  return useQuery({
    queryKey: ['pos-today-orders', checkoutScope, shiftId, day],
    queryFn: async ({ signal }) => {
      const requireCurrentDay = () => {
        // Consuming the signal lets Query cancel detached scope/day observers.
        // The existing API transport may finish, but its result cannot publish.
        if (signal.aborted) throw new CancelledError();
        const current = today();
        if (current !== day) {
          setDay(current);
          throw new CancelledError();
        }
      };
      requireCurrentDay();
      const response = await posApi.getTodayOrders(shiftId);
      requireCurrentDay();
      return response.data.data;
    },
    staleTime: 10_000,
    // Never carry another day's/tenant's/shift's rows into this observer.
    placeholderData: undefined,
  });
}
