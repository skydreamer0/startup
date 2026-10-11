export const pages = ['margin', 'sales-ranking'];
export const widths = [1440, 390];
export const flows = ['pending and empty', 'success and inputs', 'initial error and recovery', 'refetch failure and recovery', 'period change'];
export const expectedCases = pages.flatMap(page => widths.flatMap(width => flows.map(flow => `${page} ${width}: ${flow}`)))
  .concat(widths.map(width => `sales-ranking ${width}: quantity sort`), ['batch-trace 1366: source lifecycle', 'batch-trace 390: source errors']);

export const importCases = ['import 1440: keyboard and idle dismissal', 'import 390: keyboard and idle dismissal',
  'import 1440: preview pending recovery', 'import 1440: confirm pending pairing', 'import 1440: confirmation failure reset',
  ...['preview', 'confirm'].flatMap(phase => ['success', 'error'].map(outcome => `import 1440: late ${phase} ${outcome}`))];
expectedCases.push(...importCases);
