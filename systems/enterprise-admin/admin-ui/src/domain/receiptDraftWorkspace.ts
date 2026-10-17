import {
  addLine, updateLine, removeLine, reviewLine, revokeReview,
} from './receiptDraft.ts';
import type { ReceiptDraft, ReceiptFields } from './receiptDraft.ts';

/** Context labels only: not authentication, permissions, persistence, or posting. */
export type WorkspaceScope = Readonly<{ tenantId: string; actorId: string }>;
export type ClosedWorkspace = Readonly<{ status: 'closed'; generation: symbol }>;
export type OpenWorkspace = Readonly<{
  status: 'open'; generation: symbol; scope: WorkspaceScope; draft: ReceiptDraft;
}>;
export type WorkspaceSnapshot = ClosedWorkspace | OpenWorkspace;
export type WorkspaceCommand =
  | Readonly<{ type: 'add'; lineId: string; fields?: Partial<ReceiptFields> }>
  | Readonly<{ type: 'update'; lineId: string; patch: Partial<ReceiptFields> }>
  | Readonly<{ type: 'remove' | 'review' | 'revokeReview'; lineId: string }>;
export class WorkspaceError extends Error {
  readonly code: 'STALE_WORKSPACE' | 'WORKSPACE_CLOSED' | 'INVALID_SCOPE' | 'INVALID_COMMAND' | 'STALE_SUGGESTION';
  constructor(code: WorkspaceError['code']) {
    super(code); this.name = 'WorkspaceError'; this.code = code;
  }
}

declare const ticketBrand: unique symbol;
/** Opaque in-memory handle. Copies and deserialized lookalikes are not valid. */
export type SuggestionTicket = Readonly<{ [ticketBrand]: true }>;
export type DraftSuggestion = Readonly<{ lineId: string; fields: ReceiptFields }>;
type Request = { view: OpenWorkspace; lineId: string };
type Proposal = Request & { ticket: SuggestionTicket; next: ReceiptDraft };
type Slot = { ticket: SuggestionTicket; suggestion: DraftSuggestion | null };
type StaleResult = Readonly<{ status: 'stale' }>;
type ReadySuggestion = Readonly<{ status: 'ready'; view: OpenWorkspace; suggestion: DraftSuggestion }>;
export type SuggestionResult = StaleResult | ReadySuggestion;
export type SuggestionState = Readonly<{ status: 'idle' | 'pending' }> | ReadySuggestion;
const stale: StaleResult = Object.freeze({ status: 'stale' });

function scopeSnapshot(raw: WorkspaceScope): WorkspaceScope {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new WorkspaceError('INVALID_SCOPE');
  const prototype = Object.getPrototypeOf(raw);
  if (prototype !== Object.prototype && prototype !== null) throw new WorkspaceError('INVALID_SCOPE');
  const keys = Reflect.ownKeys(raw);
  if (keys.length !== 2 || !keys.includes('tenantId') || !keys.includes('actorId')) throw new WorkspaceError('INVALID_SCOPE');
  const values: Record<string, string> = {};
  for (const key of ['tenantId', 'actorId'] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(raw, key);
    if (!descriptor || !('value' in descriptor) || typeof descriptor.value !== 'string' || !descriptor.value.trim()) {
      throw new WorkspaceError('INVALID_SCOPE');
    }
    values[key] = descriptor.value;
  }
  return Object.freeze({ tenantId: values.tenantId!, actorId: values.actorId! });
}

/**
 * Same-page adapter. Drafts must originate from the receiptDraft factory/reducers.
 * Keep one instance across the owner's lifecycle, or discard it completely when
 * its owner unmounts. Never route old callbacks to a new instance by ID alone.
 * Explicit navigation, auth-context changes (even the same actor), and same-ID
 * recreation must call open; cancellation/unmount must call close. No I/O occurs.
 */
export function createReceiptWorkspace() {
  let current: WorkspaceSnapshot = Object.freeze({ status: 'closed', generation: Symbol('receipt-workspace') });
  const requests = new WeakMap<SuggestionTicket, Request>();
  const proposals = new WeakMap<DraftSuggestion, Proposal>();
  const slots = new Map<string, Slot>();

  function assertCurrent(expected: WorkspaceSnapshot): void {
    if (expected !== current) throw new WorkspaceError('STALE_WORKSPACE');
  }
  function active(expected: WorkspaceSnapshot): OpenWorkspace {
    assertCurrent(expected);
    if (expected.status !== 'open') throw new WorkspaceError('WORKSPACE_CLOSED');
    return expected;
  }
  function commit(view: OpenWorkspace, draft: ReceiptDraft): OpenWorkspace {
    assertCurrent(view);
    if (draft === view.draft) return view;
    slots.clear(); // The underlying reducer has whole-draft revision CAS.
    current = Object.freeze({ ...view, draft });
    return current;
  }
  function pending(ticket: SuggestionTicket): Request | undefined {
    const request = requests.get(ticket);
    if (!request || current !== request.view) return undefined;
    const slot = slots.get(request.lineId);
    return slot?.ticket === ticket && slot.suggestion === null ? request : undefined;
  }

  return Object.freeze({
    getSnapshot(): WorkspaceSnapshot { return current; },

    /** Render through the current view; never reuse a cached result by row ID. */
    suggestionFor(expected: WorkspaceSnapshot, lineId: string): SuggestionState {
      const view = active(expected), slot = slots.get(lineId);
      if (!slot) return Object.freeze({ status: 'idle' });
      if (!slot.suggestion) return Object.freeze({ status: 'pending' });
      return Object.freeze({ status: 'ready', view, suggestion: slot.suggestion });
    },

    /** Always starts a fresh generation, even for identical labels and draft. */
    open(expected: WorkspaceSnapshot, scope: WorkspaceScope, draft: ReceiptDraft): OpenWorkspace {
      assertCurrent(expected);
      const checkedScope = scopeSnapshot(scope);
      assertCurrent(expected);
      current = Object.freeze({ status: 'open', generation: Symbol('receipt-workspace'), scope: checkedScope, draft });
      slots.clear();
      return current;
    },

    /** A late Close/Cancel cannot clear work opened or changed since its capture. */
    close(expected: WorkspaceSnapshot): ClosedWorkspace {
      assertCurrent(expected);
      current = Object.freeze({ status: 'closed', generation: Symbol('receipt-workspace') });
      slots.clear();
      return current;
    },

    dispatch(expected: WorkspaceSnapshot, command: WorkspaceCommand): OpenWorkspace {
      const view = active(expected), draft = view.draft, revision = draft.revision;
      switch (command.type) {
        case 'add': return commit(view, addLine(draft, revision, command.lineId, command.fields));
        case 'update': return commit(view, updateLine(draft, revision, command.lineId, command.patch));
        case 'remove': return commit(view, removeLine(draft, revision, command.lineId));
        case 'review': return commit(view, reviewLine(draft, revision, command.lineId, view.scope.actorId));
        case 'revokeReview': return commit(view, revokeReview(draft, revision, command.lineId));
        default: throw new WorkspaceError('INVALID_COMMAND');
      }
    },

    /** Latest request wins per line; requests on other rows are independent. */
    beginSuggestion(expected: WorkspaceSnapshot, lineId: string): SuggestionTicket {
      const view = active(expected);
      // Reuse reducer input validation without creating or installing new data.
      updateLine(view.draft, view.draft.revision, lineId, {});
      assertCurrent(view);
      const ticket = Object.freeze({}) as SuggestionTicket;
      requests.set(ticket, { view, lineId });
      slots.set(lineId, { ticket, suggestion: null });
      return ticket;
    },

    /** A response is a proposal only. It never mutates the current draft. */
    receiveSuggestion(ticket: SuggestionTicket, patch: Partial<ReceiptFields>): SuggestionResult {
      const request = pending(ticket);
      if (!request) return stale; // Do not even inspect a stale response payload.
      const { view, lineId } = request;
      const next = updateLine(view.draft, view.draft.revision, lineId, patch);
      // Raw objects can have proxy traps. Validation must not revive a request
      // superseded by re-entrant navigation/editing while it was being checked.
      if (pending(ticket) !== request) return stale;
      const fields = next.lines.find(line => line.id === lineId)!.fields;
      const suggestion = Object.freeze({ lineId, fields });
      proposals.set(suggestion, { ...request, ticket, next });
      slots.set(lineId, { ticket, suggestion });
      return Object.freeze({ status: 'ready', view, suggestion });
    },

    /** Failure/cancellation settles only this still-pending request. */
    failSuggestion(ticket: SuggestionTicket): Readonly<{ status: 'cleared' }> | StaleResult {
      const request = pending(ticket);
      if (!request) return stale;
      slots.delete(request.lineId);
      return Object.freeze({ status: 'cleared' });
    },

    /** Call only after explicit selection. No confidence or release policy exists. */
    applySuggestion(expected: WorkspaceSnapshot, suggestion: DraftSuggestion): OpenWorkspace {
      const view = active(expected), proposal = proposals.get(suggestion);
      if (!proposal || proposal.view !== view || slots.get(proposal.lineId)?.suggestion !== suggestion) {
        throw new WorkspaceError('STALE_SUGGESTION');
      }
      // Consume even a no-op proposal; a second application must not be accepted.
      slots.delete(proposal.lineId);
      return commit(view, proposal.next);
    },
  });
}
