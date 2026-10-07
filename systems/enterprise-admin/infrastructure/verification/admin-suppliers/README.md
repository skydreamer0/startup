# #50A supplier array and query-state verification

Base: `master@1f7eeb092af0fd66ca4f3533939c44662020c9d8`. Executed 2026-10-07 in the existing `/workspace/startup` executor on `fix/admin-supplier-list-state`; separate from unmerged scanner Draft #53/head `48f1e914d569055640e9e52aafa9c751a0b9ac31`.

## Checkpoint scope

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

The tests render actual pages, QueryClient, PlanGate and inventory client. Only external HTTP methods are mocked. All fixtures are synthetic; requests, including explicit test Save, cannot reach a real API or database. There is no production supplier/payment/patient/prescription/inventory data.

## Pending at this early Draft checkpoint

Successful-empty, 500/offline, failed refetch/current-selection and more retry cases are still to be added. Full admin unit and final static checks remain to run. No acceptance is inferred from this five-case checkpoint.

Browser, real HTTP/database, hardware and CI are intentionally not run. Commits carry `[skip ci]`; workflow files and Actions enable/dispatch/rerun are untouched. Exact-head all-event workflow-run count and complete remote readback will be recorded in the PR after saving. No merge/ready/deploy, permission/credential change or #37 error retry is performed.

Product pagination and lowStock-before-pagination belong to #50B. Broader #50/#31, G0–G7, scanner/barcode, business date/money and production gates remain incomplete. Independent source/raw review is pending.

## Reproduce locally

From `systems/enterprise-admin/admin-ui`: `npm test -- src/__tests__/supplierLists.test.tsx`, `npm test`, `npm run build`, `npm run lint`. From repository root: `./scripts/validate-agent-context.sh`, `git diff --check`, `git diff --cached --check`. Use synthetic fixtures only; no installation is required in the original prepared executor.
