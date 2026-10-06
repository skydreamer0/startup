# pos-ui Module Context

## Purpose

`pos-ui` is the React + Vite point-of-sale interface. It owns cashier-facing workflows, POS state, POS service calls, and POS UI tests / Playwright flows.

## Read this first for

- POS checkout, cart, payment, settlement, or shift UI work.
- POS state/store/service changes.
- POS unit, integration, or E2E test failures.

## Directory map

| Path | Purpose |
| ---- | ------- |
| `src/api/` | POS API clients and request helpers. |
| `src/components/` | POS UI components. |
| `src/components/ui/` | Lower-level reusable UI primitives. |
| `src/hooks/` | POS hooks. |
| `src/lib/` | POS utilities. |
| `src/pages/` | POS screens. |
| `src/services/` | POS workflow services, including checkout intent and offline transaction ledger modules. |
| `src/store/` | POS state management. |
| `src/__tests__/` | POS unit/integration tests. |
| `e2e/` | Playwright E2E tests. |

## Source-of-truth documents

| Need | Read |
| ---- | ---- |
| POS roadmap / status | `../ROADMAP.md` |
| Backend API contract | `../infrastructure/api/api_spec.md` |
| Shared types | `../packages/types/MODULE.md` and `../packages/types/src/` |
| POS planning history | Use `../ROADMAP.md`, ADRs, and git history; completed POS execution plans are not kept in the active working tree. |
| Agent route selection | `../../../docs/agents/navigation.md` from repo root |

## Common task routes

### Change checkout or cart behavior

1. Open the nearest POS page/component/store/service files.
2. Use `src/services/checkoutIntent.ts` for checkout payload assembly and `src/services/posOfflineLedger.ts` for offline sync behavior before adding page-level workflow logic.
3. Read backend API spec if requests or persistence are involved.
4. Open nearest POS tests or E2E flow.
5. Update context if workflow meaning, task routing, or API contract assumptions change.
6. Checkout recovery uses `src/store/checkoutRecoveryStore.ts`, `src/hooks/useCheckout.ts` and `CheckoutRecovery`. Authenticated checkout context scopes the frozen pre-submit intent to tenant/user, independently of modal and token renewal. Pending/unknown/conflict blocks cart mutations. Query verifies the saved normalized payloadHash before clearing only the confirmed intent. Known conflict requires manual investigation and stays frozen through failed/successful lookup, reauthentication and refresh; it cannot be downgraded to unknown or automatically confirmed. See ADR-018 and `e2e/checkout-recovery.spec.ts`. Full offline synchronization remains separate.

### Change refund or physical-return behavior

1. Read API spec §3.8 and ADR-015. `posApi.refundOrder` registers a monetary refund status; it does not restore physical inventory or execute a payment-provider transfer.
2. Keep `RefundModal`, order lookup, checkout toasts and shift-report labels consistent with refund registration. Actual goods receipt/inspection is a separate pending workflow.
3. Use `e2e/checkout-flow.spec.ts` for the real checkout-to-refund flow; backend PostgreSQL cases verify unchanged product/lot/movement/allocation balances and competing refund requests.

### Debug POS test failure

1. Read the failing unit/integration/E2E test.
2. Open only referenced POS files.
3. Read backend docs/source only if the failure crosses the API boundary.

### Change POS API calls

1. Read `../infrastructure/api/api_spec.md`.
2. Open the relevant `src/api/` or `src/services/` files.
3. Open affected stores/pages/tests.

## Commands

Run from `systems/enterprise-admin/pos-ui/`:

```bash
npm run test
npm run test:e2e
npm run build
```

For the opt-in real HTTP restart/lost-response suite, use
`npm run test:e2e:http-recovery:types` then `npm run test:e2e:http-recovery` with
explicit `POS_HTTP_RECOVERY_DATABASE_URL`. It creates isolated synthetic fixture
databases and owns the API/POS processes; do not supply a store or existing server.
See `../infrastructure/verification/checkout-command/http-restart/README.md`.

## Do not assume

- Do not read admin UI unless the task involves shared behavior or shared components.
- Do not change backend assumptions without checking the API spec and relevant backend module.
- Do not infer POS roadmap completion from UI files; read `../ROADMAP.md` first.
