export const pages = ['margin', 'sales-ranking'];
export const widths = [1440, 390];
export const flows = ['pending and empty', 'success and inputs', 'initial error and recovery', 'refetch failure and recovery', 'period change'];
export const expectedCases = pages.flatMap(page => widths.flatMap(width => flows.map(flow => `${page} ${width}: ${flow}`)))
  .concat(widths.map(width => `sales-ranking ${width}: quantity sort`));
