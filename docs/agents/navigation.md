# Agent Navigation

Use this file to choose the smallest useful read set before opening source files.

## Default route

Read:

1. `AGENTS.md`
2. `CONTEXT-MAP.md`
3. `systems/enterprise-admin/CONTEXT.md`
4. This file
5. The task-specific route below

Avoid broad source crawling until the route is selected. Paths below are
repository-relative unless a link resolves from this document. Read the relevant
MODULE before its source; a filename is an entry point, not proof of completion.

## Six workflow routes

The [design MASTER](../../systems/enterprise-admin/infrastructure/design-system/MASTER.md#role-journeys)
owns the role/start/interruption/finish presentation of these journeys. This is
only the code/evidence router. Original AC remain in
[#31](https://github.com/skydreamer0/startup/issues/31) and
[#37](https://github.com/skydreamer0/startup/issues/37).
Paths in the table are relative to `systems/enterprise-admin/`.

| Journey | Minimum context and source entry | Evidence / boundary |
| ------- | -------------------------------- | ------------------- |
| Receiving / 收貨 | `admin-ui/MODULE.md`, `backend/MODULE.md`, ADR-025; `admin-ui/src/pages/Receiving/`, `backend/src/modules/receiving-drafts/` | Private manual draft, revision CAS and readback only. Formal receipt/posting is separate. For the existing initial batch receipt use ADR-017 and `infrastructure/verification/batch-receipt-uiux/README.md`; do not treat that form as a multi-line receiving document. |
| Scan / 掃碼 | `pos-ui/MODULE.md`, shared-types MODULE, ADR-022/024 and `infrastructure/api/product-packages.md`; `pos-ui/src/components/PackageLookupDialog.tsx`, `pos-ui/src/hooks/useBarcodeScanner.ts` | Read `infrastructure/verification/pos-manufacturer-barcode-contract/README.md` and `infrastructure/verification/pos-camera-capture/README.md`. Acquisition, explicit package resolution and cart confirmation are different steps; capture/lookup do not post stock. Hardware/offline remain separate. |
| Inventory / 庫存 | Backend/Admin MODULEs, ADR-013/014/020/021; `backend/src/lib/inventory-posting.ts`, `admin-ui/src/pages/Inventory/BatchListPage.tsx` and `admin-ui/src/pages/Inventory/BatchTraceDialog.tsx` | `infrastructure/verification/inventory-provenance/README.md` and `infrastructure/verification/batch-source-trace/README.md`. Trace/reconciliation readers do not repair quantities. Common sale posting is not all-writer, opening, bins or rebuild completion. |
| Checkout / 結帳 | POS/Backend MODULEs, ADR-018/019; `pos-ui/src/hooks/useCheckout.ts`, `pos-ui/src/store/checkoutRecoveryStore.ts`, `backend/src/modules/pos/checkout-command.service.ts` | `infrastructure/verification/checkout-command/README.md`, `infrastructure/verification/checkout-command/http-restart/README.md`, `pos-ui/e2e/recovery-native/README.md`. Preserve command/hash, frozen unknown/conflict and confirmed-only completion; offline/financial/store gates remain separate. |
| Return / 退回 | POS/Backend MODULEs, ADR-015; `pos-ui/src/components/RefundModal.tsx`, `backend/src/modules/pos/checkout.service.ts` | Refund registration is money-status only, with unchanged physical stock. `pos-ui/e2e/recovery-native/README.md` is bounded recovery/refund evidence; physical receipt, quarantine/release and partial-return policy remain #29/#30/#37 work. |
| Expiry / 效期 | Admin/Backend MODULEs, ADR-014; `admin-ui/src/pages/Inventory/BatchListPage.tsx`, `admin-ui/src/pages/Inventory/InventoryAnalyticsPage.tsx`, `backend/src/modules/product-batches/product-batches.service.ts` | `infrastructure/verification/admin-readers-native/README.md` and `infrastructure/verification/inventory-fefo-trace-acceptance/README.md`. Expiry/stock readouts do not release quarantined goods. Lot → bin → action-draft remains open; keep unknown/error distinct from zero/empty. |

Read [the touch/workflow review skill](../../.agents/skills/pharmacy-touch-ui-review/SKILL.md)
for affected UI acceptance, preserving its existing PHARMACY-OVERRIDES route.
Printing crosses these journeys but remains a no-stock-effect path; use the
local-label task route below. Financial reports use Admin/Backend MODULE reader
routes and #30 before interpreting estimates as accounting facts.

## Authority and dispatch

- [ROADMAP current status](../../systems/enterprise-admin/ROADMAP.md#current-status)
  routes implementation and evidence. Read the live PR/head before redoing a
  supposedly missing feature; old Draft/proposed text can be historical.
- Accepted ADRs govern architecture; API contracts and schema/migrations govern
  their respective interfaces/data. A UI guideline or historical plan cannot
  replace original Issue AC or override the latest user instruction.
- The [dispatch contract](../../.agents/skills/triage/AGENT-BRIEF.md#dispatch-contract)
  records exact base/head, file ownership, dependencies, required evidence and
  stopping boundaries. It does not create authorization or erase a prior stop.
  Parallel work must own disjoint files; shared schema/posting work needs one
  integration owner. Do not begin a second implementation because a PR is Draft.
- Keep source review, mock/JSDOM, real browser, real API/PG and physical/store
  evidence separate. Re-run only affected checks and required integration/CI for
  the final subject. PASS/FAIL/NOT RUN must retain their actual scope.

## Task routes

| Task type | Read first | Then read | Avoid |
| --------- | ---------- | --------- | ----- |
| Feature status / roadmap | `systems/enterprise-admin/ROADMAP.md` current status; #31/#37 AC | Current PR/head and referenced bounded evidence; historical plans only when needed | Inferring progress from source files, old Draft labels or CI alone |
| Shared architecture | Relevant accepted ADR, `docs/architecture.md` | Selected module/standard and nearest source | Treating a proposed ADR or historical generic blueprint as accepted deployment architecture |
| Backend API | `systems/enterprise-admin/backend/MODULE.md`, then `systems/enterprise-admin/infrastructure/api/api_spec.md` | Nearest backend route, service, repository, and tests | Reading every backend module |
| Database / Prisma | `systems/enterprise-admin/backend/MODULE.md`, then `systems/enterprise-admin/backend/prisma/schema.prisma` | Relevant migrations, seed files, services, tests | Changing model meaning without context updates |
| Admin UI | `systems/enterprise-admin/admin-ui/MODULE.md` | Nearest screen, component, hook, API client, and tests | Reading backend unless API behavior is involved |
| POS UI | `systems/enterprise-admin/pos-ui/MODULE.md` | Nearest POS screen, component, state, test, and API call | Reading admin UI unless shared behavior is involved |
| Local BLE label printing | `systems/enterprise-admin/local-print-agent/README.md`, `systems/enterprise-admin/infrastructure/adr/adr_023_local_ble_medicine_label_bridge.md` | `admin-ui/MODULE.md`, product list, label dialog/client, nearest Python API/renderer/transport/tests | Routing workstation BLE through the cloud backend or treating receipt printing as labels |
| Shared types | `systems/enterprise-admin/packages/types/MODULE.md` | Relevant type source and consumers | Duplicating types in app-specific modules |
| Standards / workflow | `systems/enterprise-admin/infrastructure/standards/README.md` | Specific standard file and PR template | Updating workflow without updating agent context |
| Dependencies / lockfiles | `systems/enterprise-admin/infrastructure/standards/dependency_management.md` | Owning manifest, canonical lock, CI and Dockerfile | Adding a second lockfile or putting backend in the frontend workspace |
| Tests | Nearest package.json and nearest test files | Test pyramid standard if scope is broad | Running unrelated full suites before localizing failure |

## End-of-work route

Before finishing:

1. Run `git diff --name-only`.
2. Decide whether changed files affect context freshness.
3. Update context files if the change affects module boundaries, workflows, source-of-truth locations, API contracts, data-model meaning, or architecture constraints.
4. Run `./scripts/validate-agent-context.sh`.
5. Commit with the repository Conventional Commit format.

## Context freshness examples

| Change | Context update needed? |
| ------ | ---------------------- |
| Add a new backend module | Yes: system context and navigation/module docs |
| Move API source-of-truth location | Yes: context map, system context, and navigation |
| Add a route matching existing API patterns | Usually no, unless API contract docs changed |
| Rename a Prisma model | Yes: schema docs/context that explain model meaning |
| Fix an isolated UI bug | Usually no |
| Change PR or branch workflow | Yes: standards, `AGENTS.md`, and PR template if applicable |
