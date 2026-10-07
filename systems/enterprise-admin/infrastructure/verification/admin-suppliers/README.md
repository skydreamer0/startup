# #50A supplier array and query-state verification

Base: `master@1f7eeb092af0fd66ca4f3533939c44662020c9d8`. Executed 2026-10-07 in the existing `/workspace/startup` executor on `fix/admin-supplier-list-state`; separate from unmerged scanner Draft #53/head `48f1e914d569055640e9e52aafa9c751a0b9ac31`.

## Candidate scope

`inventoryApi.getSuppliers(): Promise<Supplier[]>` uses the existing shared `ApiSuccess<Supplier[]>` and `Supplier` types. It unwraps the existing HTTP `{ success: true, data: Supplier[] }` once; ProductListPage options and SupplierListPage rows consume the array directly. No backend wire/schema/auth change or product-pagination work is included.

Queries distinguish loading, successful empty and failure. A failed supplier query exposes 403/HTTP status or a connection-failure message and explicit Retry. Missing supplier options retain the product form's current supplierId and a visible option. Query changes do not reset form state or automatically select the first returned supplier. Retry is `type=button`; it cannot submit the product form. Cached rows can remain visible with an error and last-loaded label after a failed refresh.

## Actual RED/GREEN

Raw stdout/stderr is retained byte-for-byte in [raw.zip](raw.zip), with [entry size/SHA256 manifest](raw-manifest.json). No raw output was trimmed or rewritten.

| Evidence entry | Actual result |
| --- | --- |
| `01-supplier-envelope-red.txt` | 2 failed / 1 passed. Client returns one Supplier from the real envelope. Add Product opens successfully, then the named supplier option is absent; SupplierList renders no row. These failures do not depend on a new aria label or dialog role. |
| `02-supplier-envelope-green.txt` | 3/3 passed after array consumption and supplier label association. |
| `03-supplier-error-selection-red.txt` | 2 failed / 3 passed: 403 leaves the existing product supplier visibly blank; SupplierList displays successful-empty text instead of an alert. `DEBUG_PRINT_LIMIT=2000` limits DOM diagnostic size only. |
| `04-supplier-error-selection-green.txt` | 5/5 passed. Retry does not call create/update; original supplierId and edited product name remain, despite another supplier being returned first. Explicit Save sends the retained supplierId through the mocked HTTP boundary. |
| `05-first-type-build.txt` | TypeScript and Vite build passed. |
| `06-first-admin-lint.txt` | Complete admin `eslint src/` passed. |
| `07-supplier-complete-focused.txt` | 1 failed / 24 passed. New loading assertion matched both the supplier status and stock output's implicit status; test locator was corrected without relaxing the loading/empty assertions. |
| `08-supplier-complete-focused-green.txt` | 31/31 passed: typed success/empty client contract; 403/500/offline/generic request rejection; both pages' errors and retries; loading versus successful empty; valid new draft retained with zero retry writes and no automatic supplier choice; existing supplier ID visibly retained and explicitly saved during error/empty; selected ID/draft preserved after failed background refetch and after recovery omits that supplier; stale cached rows visibly marked; failed refetch is never shown as successful empty. |
| `09-full-admin-green.txt` | 8 files / 52 tests passed; no skips/unhandled errors reported. |
| `10-final-admin-type-build.txt` | TypeScript and Vite build passed, including the client return-type assertion and all test fixtures. |
| `11-final-admin-lint.txt` | Complete admin `eslint src/` passed. |
| `12-final-context-scope-checks.txt` | Agent context and diff checks passed; all 14 ROADMAP checkbox lines, three first-checkpoint production blobs, original #53 branch and six first-checkpoint raw entries are unchanged. Scope excludes backend/POS/shared types/workflows/dependencies. Existing Node 24.19.0/npm 11.9.0 recorded. |

The tests render actual pages, QueryClient, PlanGate and inventory client. Only external HTTP methods are mocked. All fixtures are synthetic; requests, including explicit test Save, cannot reach a real API or database. There is no production supplier/payment/patient/prescription/inventory data.

## Results and remaining limits

The early Draft checkpoint `9f3d22707ef774110a7a3c434917a1431cea2486` preserved five-case GREEN before the remaining cases/full checks. The three production source blobs have not changed since that checkpoint; follow-up work expands synthetic verification and records its actual results. Latest focused 31/31, full admin 52/52, type/build and lint pass. Final context/whitespace, original raw preservation and scope checks pass; see [checks.txt](checks.txt). Exact remote readback is recorded in the PR after saving. Independent source/raw acceptance remains pending.

The initial RED used existing Add Product/Edit/option and table text locators. Adding a Supplier label association is a narrow control improvement; it is not the cause of the original missing-option/missing-row RED. The new-product retry case fills valid required SKU/name fields so implicit submission could not be masked by browser form validation. Explicit Save remains a mocked API call, including when supplier reads still fail; product supplierId is preserved in its payload.

Browser, real HTTP/database, hardware and CI are intentionally not run. Commits carry `[skip ci]`; workflow files and Actions enable/dispatch/rerun are untouched. Exact-head all-event workflow-run count and complete remote readback will be recorded in the PR after saving. No merge/ready/deploy, permission/credential change or #37 error retry is performed.

Product pagination and lowStock-before-pagination belong to #50B. Broader #50/#31, G0–G7, scanner/barcode, business date/money and production gates remain incomplete. Independent source/raw review is pending.

## Reproduce locally

From `systems/enterprise-admin/admin-ui`: `npm test -- src/__tests__/supplierLists.test.tsx`, `npm test`, `npm run build`, `npm run lint`. From repository root: `./scripts/validate-agent-context.sh`, `git diff --check`, `git diff --cached --check`. Use synthetic fixtures only; no installation is required in the original prepared executor.
