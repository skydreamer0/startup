import api from './client';
import { addLine, createDraft, reviewLine } from '../domain/receiptDraft';
import type { ReceiptDraft, ReceiptFields } from '../domain/receiptDraft';

export type SavedDraftPayload = { title: string; lines: { id: string; fields: ReceiptFields; reviewed: boolean }[] };
export type SavedReceivingDraft = {
  id: string; revision: number; tenantId: string; ownerId: string; updatedAt: string; payload: SavedDraftPayload;
};
export type ReceivingDraftSummary = { id: string; revision: number; title: string; updatedAt: string };
export type ReceivingDraftList = { data: ReceivingDraftSummary[]; page: number; limit: number; total: number; tenantId: string; ownerId: string };
function unwrap<T>(response: { data: { success: boolean; data: T } }): T {
  if (response.data.success !== true) throw new Error('草稿回應格式不完整');
  return response.data.data;
}
export const receivingDraftsApi = {
  async list(page: number, signal: AbortSignal): Promise<ReceivingDraftList> {
    return unwrap(await api.get('/receiving-drafts', { params: { page }, signal }));
  },
  async get(id: string, signal: AbortSignal): Promise<SavedReceivingDraft> {
    return unwrap(await api.get(`/receiving-drafts/${encodeURIComponent(id)}`, { signal }));
  },
  async history(id: string, page: number, signal: AbortSignal): Promise<{ revision: number; createdAt: string }[]> {
    return unwrap(await api.get(`/receiving-drafts/${encodeURIComponent(id)}/history`, { params: { page }, signal }));
  },
  async version(id: string, revision: number, signal: AbortSignal): Promise<SavedReceivingDraft> {
    return unwrap(await api.get(`/receiving-drafts/${encodeURIComponent(id)}/history/${revision}`, { signal }));
  },
  async save(id: string, expectedRevision: number, payload: SavedDraftPayload): Promise<SavedReceivingDraft> {
    return unwrap(await api.put(`/receiving-drafts/${encodeURIComponent(id)}`, { expectedRevision, payload }));
  },
};
export function draftPayload(title: string, draft: ReceiptDraft): SavedDraftPayload {
  return { title, lines: draft.lines.map(line => ({ id: line.id, fields: { ...line.fields }, reviewed: !!line.review })) };
}
/** Rebuild only through existing reducers; server revision remains a separate CAS token. */
export function restoreDraft(saved: SavedReceivingDraft): ReceiptDraft {
  let draft = createDraft(saved.id);
  for (const line of saved.payload.lines) {
    draft = addLine(draft, draft.revision, line.id, line.fields);
    if (line.reviewed) draft = reviewLine(draft, draft.revision, line.id, saved.ownerId);
  }
  return draft;
}

/** JSONB and object insertion order must not turn identical saved data into a conflict. */
export function payloadKey(payload: SavedDraftPayload): string {
  return JSON.stringify(payload, ['title', 'lines', 'id', 'fields', 'reviewed', 'productId',
    'baseUnit', 'batchNumber', 'expiryDate', 'quantity', 'note', 'orderedQuantity',
    'quarantineQuantity', 'rejectedQuantity', 'packageDescription', 'unitCost', 'sourceReference']);
}
