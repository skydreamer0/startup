# Source, writer and test inventory

Source: #204 `67e4c43b52eab02f29c3050c2225ae1b91f558e6` /
tree `cc5230b00434655a286e2e5b87e0db3187383580`. This inspection is read-only.
[source-inventory.json](source-inventory.json) contains every mounted endpoint
with its exact route statement/line, all model owners, test paths, CLI entries
and source hashes. `verify-plan --check-source` checks the 122 endpoint set,
33-model set, runtime-file coverage and 137 fingerprints against the checkout.
It also compares backend package scripts, the separate Prisma seed hook and
explicit final-stage Docker startup argv against their source declarations.

## Mounted route groups and effects

All paths have `/api/v1/admin` prefix. Mounted means code is reachable under its
middleware/configuration, **not** that it is deployed, authorized for this run or
operationally enabled. Permission selectors and middleware text are preserved
per endpoint; AR-04 must prove effective authorization with real PG/HTTP cases.

| Route group | Accountable data owner / destination | Current effects |
| --- | --- | --- |
| /auth | access; AR-04 | User lockout/last-login and AuditLog; JWT/refresh issue, no inventory or payment effect |
| /users | access; AR-04 | User/UserRole/AuditLog; creates, updates and soft deletion, no stock/payment |
| /roles | access; AR-04 | Role/RolePermission; permission replacement, no stock/payment |
| /audit-logs | access; AR-04 | Read only AuditLog |
| /crm | CRM; AR-01, AR-11 | Customer/Interaction creation and metadata/engagement update; no stock/payment |
| /inventory | catalog + inventory; AR-03, AR-07 | Supplier/Product/PackageRevision/Identifier metadata; new product/CSV stock=0, quantity edits rejected; stock reconciliation read only |
| /dashboard | reporting; AR-12 | Read only aggregates; missing supplier-rate work belongs to open #166 |
| /orders | sales + fulfillment; AR-06, AR-07, AR-08, AR-11 | Create pending order immediately debits FEFO and writes OUT/allocation + CRM stats in one TX; status patch changes status only, no stock reversal or command dedupe |
| /analytics | reporting; AR-12 | Read-only analytics; estimates are not approved financial facts |
| /expenses | reporting/payments; AR-08, AR-12 | Expense CRUD; local record, not bank/provider transfer |
| /reports | reporting; AR-12 | Read-only; current-cost margin and placeholder/estimated cashflow are known gaps, not an oracle |
| /shifts | sales/payments; AR-08 | Shift create/close/delete; close CAS from #178/#204; no provider payment. Checkout-versus-close cutoff not proved |
| /product-batches | inventory; AR-07, AR-10 | Initial receipt creates lot, IN and receipt cost via shared TX; controlled status/expiry/cost correction audits; ordinary PATCH rejected; only zero/unreferenced batch deletion allowed |
| /receiving-drafts | receiving; AR-09 | Private actor/tenant draft CAS plus immutable revision, no receipt/stock/payment side effect |
| /daily-settlements | reporting/payments; AR-08, AR-12 | Generate/upsert/confirm local settlement; first confirm preserved by CAS #178/#204. Not immutable financial fact redesign |
| /pos | sales + access + CRM + catalog; AR-04, AR-06, AR-07, AR-08 | Checkout command TX: order/payment records/stock/movement/allocation/result. Refund updates status only, no stock or provider transfer. Customer creation delegates CRM; staff login JWT; package resolve read only |
| /tenants | organization; AR-03 | Read current tenant plan; no write |
| /excel | catalog; AR-03, AR-07 | Exports read only; product preview no write; signed confirm imports metadata at zero new stock, existing quantities preserved |
| /accounting | integrations; AR-17 | Synchronous provider attempt then AccountingSyncLog; mock fallback and check-then-send are known gaps. Live configuration not inspected |
| /line | integrations; AR-17 | Push/multicast external messaging when configured; broadcast log write. Signed webhook currently logs follow and writes no business rows. Not executed |

## Quantity/payment authority and caller cutover

1. POS `PosController.checkout → CheckoutService.checkout → CheckoutCommandService.execute` uses one TX, `InventoryPostingService.debitSale/recordSale`, order/item/payment rows, numbering and result. Preserve frozen v1 intent. AR-06/07/08 own upgrade.
2. General `OrderController.create → OrderService.createOrder` uses the same inventory functions and TX, but currently creates pending order plus CRM aggregates without command dedupe. AR-06/08/11 must reconcile subtype and delivery semantics, not silently copy POS.
3. `ProductBatchController.create → ProductBatchService.create → InventoryPostingService.receiveBatch` writes product quantity, lot and IN receipt cost; released initial receipt includes audit in that TX. AR-07/09 own additive formal receiving.
4. `batch-audit.service.ts` controls eligibility/expiry/cost, not a second quantity posting channel. Ordinary batch PATCH and direct product quantity editing are rejected. AR-07/10 retain release permission/reason and post-wait expiry checks.
5. CSV creates new metadata with zero stock and skips existing SKU; Excel signed preview/confirm updates metadata without stock. AR-03/07 keep these no-quantity contracts.
6. ReceivingDraft `PUT` writes only private draft/current revision/history. Refund changes monetary status only. Neither is a receiving writer. AR-09 and AR-08/10 must introduce new explicit commands without reusing these safe boundaries accidentally.
7. Seed/Prisma migrate/reset and Docker migration startup are separate administrative writers, never permitted ordinary runtime side doors. No seed, migration, reset, production/Preview/ambient DB or device execution occurred. AR-20 governs future isolated upgrade work.

## Non-HTTP and external effects

- `backend/src/server.ts` only readiness-checks and starts Express. No durable production worker entry or runtime cron was found in the reviewed source. The test-only checkout command worker is not production background processing. AR-13 introduces durable jobs.
- `backend/package.json` 的 13 個 scripts 全部納入來源集合比對，包含 db:migrate、db:seed、db:reset；`prisma.seed` 是另外一個入口，不能由 npm db:seed 代替。`prisma/seed.ts` 會修改資料，其來源指紋必須保留。db:studio 是可編輯資料的互動管理入口，不能當成唯讀工具。
- Docker 最終 stage 的 CMD 以完整 exec-form argv 記錄：`["sh","-c","./node_modules/.bin/prisma migrate deploy && node dist/server.js"]`。來源新增 ENTRYPOINT 或改變任一 argv 都需更新並審閱清冊；未支援的 Docker 語法拒絕通過。沒有執行任何列出的命令。
- 所有 CLI 入口均驗證 kind、owner、effect、AR destination 與唯一來源指紋。Python 入口標記為 `curated`，只有既列項目的結構及指紋檢查，沒有自動發現全部 Python 入口的宣稱。
- `backend/scripts/`, root CI/test helpers and Prisma diagnostics are individually listed. Most scripts are opt-in synthetic harnesses, not automatically enabled application writers. Their guards and external environment must be independently rechecked before execution.
- Local-print-agent API/CLI can write device receipts and send BLE; Admin label client and POS receipt/scan consumers are outside the Express quantity authority. No actual paper, device/OS permission or print transport tested here.
- Existing `scripts/ocr-evaluation/evaluator.py` and `verify.py` evaluate synthetic six-field text. They are reused; no OCR engine/model installation or real-image accuracy claim.
- Accounting and LINE side effects are configuration-dependent. No external request was made; credentials/live configuration were not inspected. No payment provider integration is inferred from CARD/LINE_PAY strings.

## Existing evidence, scoped separately from this baseline

| Input | Evidence known at freeze | Reuse boundary |
| --- | --- | --- |
| #204 complete integration tree | PR body records 64 focused backend, 61 receiving controls, 23 components, Admin 490, POS 663, lint/build/audits and source review. | Reported inherited exact-tree source evidence, not tests rerun by AR-00. Read its logs/PR and final hosted artifacts before acceptance. |
| #178 settlement CAS | Modeled conditional-update tests and source review | New native simultaneous HTTP/PG close/confirm race remains NOT_RUN; finance policy still unapproved. |
| #179 receiving lifecycle | Prior bounded native snapshot/history/unknown-Back evidence | New #204 head requires its own hosted artifact review; other-owner/tenant/read-only PUT, broader navigation and real devices still missing. |
| #175 security dependencies | Reviewed dependency stack; #204 has matching manifests/locks | Do not apply #176/#177 or reinstall/rewrite locks as part of this baseline. |
| master historical acceptance | Existing harness README and source PRs in CONTEXT/ROADMAP | Old PASS/FAIL/SKIP stays with original source, scope and environment. |

Natural CI for #204 was in progress at the recorded inspection. The snapshot is
in [upstream-checks.json](upstream-checks.json). Successful job statuses are only
remote status observations; no raw-artifact revalidation is claimed. `final-alpine`
was SKIP and remains SKIP, not PASS. Refresh live PR state before dispatch.

## Limits and known gaps

The 96 write/raw candidates are a lexical aid, include read-only raw SQL and
Prisma setting statements, and exclude test code. They do not prove all aliases,
dynamic calls, database triggers or permission paths are safe. Full runtime
hashes, explicit route/model coverage, reviewed module effects and required AR
acceptance checks work together. Inventory completeness is source-level; actual
writer cutover is not complete until each entry has exact-source PG/HTTP evidence.
Formal receipt, physical returns, bin balances, reservation, immutable refunds,
source assets, outbox, device jobs and restore are outstanding, not disabled
features proven by this inspection. A nonexistent route is not a substitute for
testing later server-side activation guards.
