export const cameraLiteral = '  001aBc\u001dhttps://example.invalid/camera  ';
export const viewports = [{ width: 1366, height: 768 }, { width: 1024, height: 768 }, { width: 390, height: 520 }];
export const cameraCases = [
  ...viewports.map(v => `camera local decode and explicit package handoff at ${v.width}x${v.height}`),
  'camera denied retry and stale permission cleanup',
];
export const expectedCases = [
  ...cameraCases,
  ...viewports.map(v => `manual literal and no-effects at ${v.width}x${v.height}`),
  'manual native keyboard focus and control activation',
  'manual repeated boundary cancels partials and resumes min3 scanner',
  ...viewports.map(v => `split keyboard and cancel at ${v.width}x${v.height}`),
  ...['remove second row', 'add fourth row', 'backdrop and title'].map(action => `native ${action} retains split focus and F4 ownership`),
  ...[1366, 390].map(width => `nested PIN cancellation restores split at ${width}px`),
  ...['pointer', 'Escape', 'Enter', 'Space'].map(key => `ordinary payment ${key} cancellation has zero checkout`),
  'ordinary payment native Enter selects CARD and submits exactly once',
  'split native confirmation preserves payload and pending keyboard ownership',
];
