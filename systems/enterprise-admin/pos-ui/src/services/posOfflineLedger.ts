import { posApi } from '../api/pos';
import { createOfflineTransactionLedger } from './offlineQueue';

export const posOfflineLedger = createOfflineTransactionLedger({
  checkout: (payload) => posApi.checkout(payload),
});
