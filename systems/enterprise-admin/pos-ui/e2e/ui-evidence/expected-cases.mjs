// Deliberately pinned to the reviewed scanner/supplier cases. Update this map
// alongside an intentional suite change, never derive it from the result report.
export const expectedCases = [
  ['scanner.spec.ts', 'two focused scans keep both intents when replies arrive in reverse order', ['scanner-two-intents.png']],
  ['scanner.spec.ts', 'two scans of the same SKU increase its quantity to two', ['scanner-same-sku-two.png']],
  ...['123', 'AMB', 'ERR'].map(code => ['scanner.spec.ts', `${code} cannot add a fuzzy, ambiguous or failed result`, [`scanner-refused-${code}.png`]]),
  ['scanner.spec.ts', 'manual search edit permanently cancels a delayed scan', ['scanner-manual-cancels-late.png']],
  ['scanner.spec.ts', 'confirmed cart clear cancels a delayed scan without any transaction', ['scanner-clear-cancels-late.png']],
  ['suppliers.spec.ts', 'real supplier envelope renders product options and supplier table rows', ['supplier-options-success.png', 'supplier-table-success.png']],
  ['suppliers.spec.ts', 'successful empty results remain distinct from an unavailable supplier list', ['supplier-table-empty.png', 'supplier-empty-retains-selection.png']],
  ...['403', '500', 'offline'].map(failure => ['suppliers.spec.ts', `${failure}: retry keeps the edited draft and missing original selection with zero submissions`, [`supplier-${failure}-draft-retained.png`, `supplier-${failure}-retry-retains-selection.png`]]),
  ['suppliers.spec.ts', 'supplier table error is unavailable and retry restores actual rows', ['supplier-table-error.png', 'supplier-table-retry-success.png']],
];
