export const expectedCloseShiftCases = [
  ...['pointer', 'Escape', 'Enter', 'Space'].map(method => `native ${method} cancellation preserves cash/cart and restores opener`),
  'native scan-like keys and F2/F8 stay inside the dialog without service side effects',
  'native confirm locks pending input, prevents duplicate/cancel, and retries only after failure',
  '390px viewport keeps named dialog and controls inside the visible screen',
  ...['F4', 'Enter', 'Escape'].map(key => `backdrop click retains native ${key} ownership`),
  'pending backdrop click cannot hold the cart or cancel the native close request',
];
