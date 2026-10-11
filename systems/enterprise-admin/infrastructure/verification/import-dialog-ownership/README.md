# Product import dialog ownership — bounded Issue #31 slice

Base: master dff3f71afc4f3d92a580bca6d667c21cb28d6c23.

Only ImportProductsModal and its tests change at runtime. ProductListPage was
inspected read-only: conditional mounting owns close/reopen; success invalidates
product queries. The File/previewToken pair, existing API payloads, metadata-only
import/stock-preservation contract and backend/schema are unchanged.

## Behavior

- Named modal dialog, initial file focus, Tab/Shift+Tab boundary cycling and
  opener return on close. Cleanup does not override focus moved to another UI.
- Escape, Cancel and backdrop dismiss only when idle; never import implicitly.
- Synchronous request guard prevents same-tick repeats and closing/file changes
  during preview/confirmation. Disabled controls fall back to the dialog itself.
- Completion restores an enabled focus target; confirmation errors invalidate
  the reviewed token and permit a fresh preview, as before.
- Detached request callbacks cannot show alerts, report success or alter the
  reopened instance. No network cancellation or server rollback is claimed.

## Verification at first publication

- PASS: source/diff inspection and agent context validation (commands below).
- BLOCKED: canonical pnpm 10.34.6 frozen/offline install cannot find
  @fontsource-variable/geist 5.3.0 in the available store. Runtime is Node
  24.19.0, not required Node 22. No dependency manifests or locks changed.
- NOT RUN locally: authored JSDOM tests, full admin tests/lint/build, actual
  browser/assistive technology and native-device acceptance.
- Exact-head GitHub CI and independent review are pending. Authored assertions
  are not executed evidence. This does not close Issue #31 or broader gates.

Reproduce with the canonical Node 22 / pnpm 10.34.6 workspace installation:

```sh
./scripts/validate-agent-context.sh
git diff --check
cd systems/enterprise-admin
pnpm --filter admin-ui test -- src/components/ImportProductsModal.test.tsx
pnpm --filter admin-ui test
pnpm --filter admin-ui lint
pnpm --filter admin-ui build
```

The original matching file/token and expired-preview cases remain. Added cases
cover named dialog, keyboard boundaries, idle dismissal, same-tick pending locks,
preview failure recovery, confirm success/Close focus, detached confirmation
success/error, and cleanup after navigation. JSDOM key events validate handlers;
real browser Tab order, file chooser, zoom and screen reader interaction remain
separate acceptance gates. Context docs need no update: no module boundaries,
workflow/source-of-truth routing, API/data meaning or architecture changed.
