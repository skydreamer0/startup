/** In-memory only. Review means data checked, never authority to post or release stock. */
export type ReceiptFields = Readonly<{
  productId: string; baseUnit: string; batchNumber: string;
  expiryDate: string; quantity: string; note: string;
  orderedQuantity?: string; quarantineQuantity?: string; rejectedQuantity?: string;
  packageDescription?: string; unitCost?: string; sourceReference?: string;
}>;
export type Review = Readonly<{ actorId: string; reviewedAtRevision: number }>;
export type ReceiptLine = Readonly<{ id: string; fields: ReceiptFields; review: Review | null }>;
export type ReceiptDraft = Readonly<{ id: string; revision: number; lines: readonly ReceiptLine[] }>;
export type FieldIssue = Readonly<{ field: keyof ReceiptFields; code: 'required' | 'invalid_date' | 'invalid_quantity' }>;
export type DraftErrorCode = 'INVALID_INPUT' | 'STALE_REVISION' | 'DUPLICATE_LINE' | 'LINE_NOT_FOUND' | 'LINE_INVALID' | 'REVISION_EXHAUSTED';
export class DraftError extends Error {
  readonly code: DraftErrorCode;
  constructor(code: DraftErrorCode) { super(code); this.name = 'DraftError'; this.code = code; }
}
const fields = ['productId', 'baseUnit', 'batchNumber', 'expiryDate', 'quantity', 'note', 'orderedQuantity', 'quarantineQuantity', 'rejectedQuantity', 'packageDescription', 'unitCost', 'sourceReference'] as const;
const required = ['productId', 'baseUnit', 'batchNumber', 'expiryDate', 'quantity'] as const;
const critical = fields.filter(key => key !== 'note');
const emptyFields: ReceiptFields = Object.freeze({ productId: '', baseUnit: '', batchNumber: '', expiryDate: '', quantity: '', note: '' });
function fail(code: DraftErrorCode): never { throw new DraftError(code); }
function record(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function identity(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) fail('INVALID_INPUT');
}
function patchFields(value: unknown): Partial<ReceiptFields> {
  if (!record(value)) fail('INVALID_INPUT');
  const result: Partial<Record<keyof ReceiptFields, string>> = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !fields.includes(key as keyof ReceiptFields)) fail('INVALID_INPUT');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    // Do not execute supplied getters while accepting raw input.
    if (!descriptor || !('value' in descriptor) || typeof descriptor.value !== 'string') fail('INVALID_INPUT');
    result[key as keyof ReceiptFields] = descriptor.value;
  }
  return result;
}
function revision(draft: ReceiptDraft, expected: number): number {
  if (!Number.isSafeInteger(expected) || expected < 0) fail('INVALID_INPUT');
  if (expected !== draft.revision) fail('STALE_REVISION');
  if (expected === Number.MAX_SAFE_INTEGER) fail('REVISION_EXHAUSTED');
  return expected + 1;
}
function snapshot(id: string, rev: number, lines: readonly ReceiptLine[]): ReceiptDraft {
  return Object.freeze({ id, revision: rev, lines: Object.freeze([...lines]) });
}
function line(id: string, raw: ReceiptFields, review: Review | null): ReceiptLine {
  return Object.freeze({ id, fields: Object.freeze({ ...raw }), review: review ? Object.freeze({ ...review }) : null });
}
function indexOf(draft: ReceiptDraft, id: string): number {
  identity(id);
  const index = draft.lines.findIndex(item => item.id === id);
  if (index < 0) fail('LINE_NOT_FOUND');
  return index;
}
function validCalendarDate(raw: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match || match[0] !== raw) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!;
}
/** Syntax only: no quantity arithmetic, unit conversion, expiry eligibility or release policy. */
export function issuesFor(raw: ReceiptFields): readonly FieldIssue[] {
  const checked = patchFields(raw);
  const issues: FieldIssue[] = [];
  for (const field of required) {
    const value = checked[field];
    if (typeof value !== 'string' || value.trim().length === 0) issues.push({ field, code: 'required' });
  }
  if (checked.expiryDate?.trim() && !validCalendarDate(checked.expiryDate)) issues.push({ field: 'expiryDate', code: 'invalid_date' });
  if (checked.quantity?.trim() && (checked.quantity.match(/^\d+(?:\.\d+)?$/)?.[0] !== checked.quantity || !/[1-9]/.test(checked.quantity))) issues.push({ field: 'quantity', code: 'invalid_quantity' });
  for (const field of ['orderedQuantity', 'quarantineQuantity', 'rejectedQuantity', 'unitCost'] as const) {
    const value = checked[field];
    if (value && value.match(/^\d+(?:\.\d+)?$/)?.[0] !== value) issues.push({ field, code: 'invalid_quantity' });
  }
  return Object.freeze(issues.map(issue => Object.freeze(issue)));
}
export function createDraft(id: string): ReceiptDraft { identity(id); return snapshot(id, 0, []); }
export function addLine(draft: ReceiptDraft, expectedRevision: number, id: string, raw: Partial<ReceiptFields> = {}): ReceiptDraft {
  const next = revision(draft, expectedRevision); identity(id);
  if (draft.lines.some(item => item.id === id)) fail('DUPLICATE_LINE');
  return snapshot(draft.id, next, [...draft.lines, line(id, { ...emptyFields, ...patchFields(raw) }, null)]);
}
export function updateLine(draft: ReceiptDraft, expectedRevision: number, id: string, patch: Partial<ReceiptFields>): ReceiptDraft {
  const next = revision(draft, expectedRevision), index = indexOf(draft, id), values = patchFields(patch);
  const old = draft.lines[index]!;
  if (fields.every(key => values[key] === undefined || values[key] === old.fields[key])) return draft;
  const invalidates = critical.some(key => values[key] !== undefined && values[key] !== old.fields[key]);
  const lines = [...draft.lines]; lines[index] = line(id, { ...old.fields, ...values }, invalidates ? null : old.review);
  return snapshot(draft.id, next, lines);
}
export function removeLine(draft: ReceiptDraft, expectedRevision: number, id: string): ReceiptDraft {
  const next = revision(draft, expectedRevision), index = indexOf(draft, id);
  return snapshot(draft.id, next, draft.lines.filter((_, i) => i !== index));
}
export function reviewLine(draft: ReceiptDraft, expectedRevision: number, id: string, actorId: string): ReceiptDraft {
  const next = revision(draft, expectedRevision), index = indexOf(draft, id); identity(actorId);
  const old = draft.lines[index]!;
  if (issuesFor(old.fields).length) fail('LINE_INVALID');
  const lines = [...draft.lines]; lines[index] = line(id, old.fields, { actorId, reviewedAtRevision: next });
  return snapshot(draft.id, next, lines);
}
export function revokeReview(draft: ReceiptDraft, expectedRevision: number, id: string): ReceiptDraft {
  const next = revision(draft, expectedRevision), index = indexOf(draft, id), old = draft.lines[index]!;
  if (!old.review) return draft;
  const lines = [...draft.lines]; lines[index] = line(id, old.fields, null);
  return snapshot(draft.id, next, lines);
}
export function summarizeDraft(draft: ReceiptDraft) {
  const reviewed: string[] = [], needsReview: string[] = [], invalid: string[] = [];
  for (const item of draft.lines) {
    if (issuesFor(item.fields).length) invalid.push(item.id);
    else if (item.review) reviewed.push(item.id);
    else needsReview.push(item.id);
  }
  return Object.freeze({ reviewed: Object.freeze(reviewed), needsReview: Object.freeze(needsReview), invalid: Object.freeze(invalid) });
}

