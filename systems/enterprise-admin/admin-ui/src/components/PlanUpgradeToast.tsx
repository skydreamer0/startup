import { useEffect, useState } from 'react';

export function PlanUpgradeToast() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const { message } = (e as CustomEvent).detail;
      setMessage(message);
      setTimeout(() => setMessage(null), 5000);
    };
    window.addEventListener('plan-upgrade-required', handler);
    return () => window.removeEventListener('plan-upgrade-required', handler);
  }, []);

  if (!message) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-amber-500 px-4 py-3 text-white shadow-lg">
      <p className="font-semibold">方案升級所需</p>
      <p className="text-sm">{message}</p>
    </div>
  );
}
