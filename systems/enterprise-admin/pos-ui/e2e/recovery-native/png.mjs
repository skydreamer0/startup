import assert from 'node:assert/strict';
import { validateExactViewportPng } from '../admin-margin-warning/png.mjs';
import { cases, stagesByCase } from './contract.mjs';

export function captureViewport(caseId, stage) {
  const scenario = cases.find(row => row.id === caseId);
  assert.ok(scenario && stagesByCase[caseId].includes(stage), 'Known recovery case and capture stage required');
  if (caseId === 'query-refund' && stagesByCase[caseId].indexOf(stage) >= 3) {
    return { width: 390, height: stage === 'refund-short-keyboard-390' ? 480 : 844 };
  }
  return { width: scenario.width, height: scenario.height };
}
export function validatePng(bytes, receipt) {
  const expected = captureViewport(receipt.caseId, receipt.stage);
  assert.deepEqual(receipt.viewport, expected, 'Receipt must match the fixed stage viewport');
  return validateExactViewportPng(bytes, expected);
}
