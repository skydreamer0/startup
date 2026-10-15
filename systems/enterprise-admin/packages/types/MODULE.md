# packages/types Module Context

## Purpose

`src/productPackages.ts` carries the shared literal identifier, reviewed revision,
history and package candidate wire shapes. It does not infer stock units or GS1
metadata; see ADR-024 and `../../infrastructure/api/product-packages.md`.

`packages/types` provides shared TypeScript types for enterprise-admin applications. It is published within the workspace as `@pharmasaas/types` and is consumed by frontend apps.

## Read this first for

- Shared type changes used by `admin-ui`, `pos-ui`, or backend-facing API clients.
- Type drift between UI code and API contracts.
- Type-only build or typecheck failures.

## Directory map

| Path | Purpose |
| ---- | ------- |
| `src/` | Shared TypeScript type definitions for backend-facing domain, report, POS, shift, and API envelope shapes. |
| `package.json` | Workspace package metadata and typecheck command. |

## Source-of-truth documents

| Need | Read |
| ---- | ---- |
| API contract | `../../infrastructure/api/api_spec.md` |
| Database model names | `../../backend/prisma/schema.prisma` when type meaning maps to persisted models |
| Consumers | `../../admin-ui/` and `../../pos-ui/` nearest usage sites |

## Common task routes

### Change a shared API-facing type

1. Read `../../infrastructure/api/api_spec.md`.
2. Open the relevant file under `src/`.
3. Open nearest consumers in `admin-ui` and/or `pos-ui`.
4. Update context if type meaning changes source-of-truth assumptions.

Inventory products use `InventoryProductPage` (total/page/limit/data inside ApiSuccess),
matching API spec §3.6. It is distinct from PaginatedData (data/meta) and PaginatedList
(items/total/page/pageSize); those meanings are unchanged. Product nullable metadata,
supplier/category relations and isLowStock reflect the existing inventory wire.

### Debug typecheck failure

1. Run or inspect `npm run typecheck` output.
2. Open only the type file and nearest consumer mentioned by the error.

## Commands

Run from `systems/enterprise-admin/packages/types/`:

```bash
npm run typecheck
```

## Do not assume

- Do not duplicate shared types in app-specific modules when the type belongs here.
- Do not change API-facing type meaning without checking the API spec.

### Local scan evidence

`src/scan.ts` exports versioned `ScanResultV1` through the existing package. This
is local acquisition evidence, not an API/DB contract or product match. Unknown
bytes/symbology/GS1 remain explicit. See ADR-022 for literal and route semantics.
