# Product import dialog ownership — bounded Issue #31 slice

First-publication base: master dff3f71afc4f3d92a580bca6d667c21cb28d6c23.
Later integration and corrections are recorded below; this is historical provenance.

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


## Bounded browser follow-up

A test-only extension to the existing Admin CI harness adds nine import cases
against unchanged PR #120 source head
`edbebb04290e68c0fd5dac31b555cc2cca0d4190` (tree
`70acd506b6bfe35487c975b7b2370ee5588d01d0`). It retains all 24 prior cases.
The same Node 22 / pnpm 10.34.6 / installed sandboxed Chrome job runs:

```sh
node --test pos-ui/e2e/admin-margin-warning/run.test.mjs
node pos-ui/e2e/admin-margin-warning/run.mjs
```

New coverage: native browser Tab/Shift+Tab/Escape/Enter and pointer dismissal,
file chooser event plus selected-file multipart byte/token identity, pending
native repeat input and disabled Cancel/file controls, preview/confirmation
failure recovery, successful Close focus, and late preview/confirmation success
and error after browser Back/Forward unmount/reopen. Widths are 1440 and 390 for
idle keyboard flow; request lifecycle cases are 1440. Same-tick synchronous
programmatic race coverage remains in the original 12 component tests.

Only the two exact loopback preview/confirm POST paths are opted in by import
cases. Their small synthetic file payloads are validated and always fulfilled
in browser routing. Nothing forwards to a backend. All other writes, external
requests and WebSockets remain blocked; original cases remain GET-only. No
real accounts, XLSX parser, API/database writes or stock changes are involved.
The synthetic file chooser payload is not a valid workbook and does not claim
native OS picker, real XLSX parsing, assistive technology, native zoom or device
acceptance. The existing source/execution identity checks, owned process cleanup,
strict no-retry case registry, screenshots and artifact publication remain.

Authored test code is not a runtime pass. The local Chromium socket-policy denial
is not retried or relaxed. Execution is assigned to the existing GitHub Admin CI
job; exact-head result, artifact and independent PNG review must be recorded
before claiming this bounded browser gate passed. No merge/deploy is authorized.

### First actual-browser finding and bounded repair

The first test-only head `0c024039a1357c74b623f662e6c355489a88a7b7` ran in
GitHub run `38131484433`: 31/33 browser cases passed. All seven import request
cases passed; both idle keyboard flows failed at the final `(2, 2)` backdrop
click. Artifact `11699311473` (ZIP SHA-256
`f84eb4c9fed9d4bd710188e2da2f149f85d880164fd54d120317384cd43fa99f`)
shows the dialog was an inline card. The existing `modal-overlay` class had no
stylesheet rule; `(2, 2)` therefore hit the sidebar. At 390px the card also
extended below the viewport. Typecheck/build and all 29 harness guard cases
passed; the browser result remained failed, with owned processes quiescent.

The follow-up adds an import-only body portal, full-viewport fixed dimmed
backdrop and bounded scrollable card, using the existing receipt dialog's
720px/55%-backdrop/44px-control visual pattern. Backdrop mousedown preserves
the pending dialog's keyboard focus. It does not change shared modal classes,
other dialogs, HTTP/token semantics, or backend code. The same nine cases and
original failing click remain. New geometry/hit-test and pending-backdrop
assertions make the missing overlay fail directly; they do not hide the failure.
Independent source/PNG review and final-head CI are still required. This repair
does not claim assistive-technology or physical-device acceptance.

## Confirmed-write freshness correction after PR #122 integration

The combined source at `e78780a9dde14c6cf1406d5733461433bbdb9da5`
(tree `2048c3c80dba2e1f1ef191f8d6cfafd7d11c8e2a`) retained a real
cache bug: its mounted guard suppressed the caller's catalog invalidation when
confirmation completed after route unmount. A reopened list could finish its GET
before the old write committed, then remain stale. The prior late-success browser
case even required no additional read. An independent extracted-function Node
probe reproduced this source path; that probe was not React or browser evidence.

Confirmation now invalidates the products query after a successful HTTP response,
independently of the dialog instance. It does so only while the originating
nonempty login session still matches: the existing stable refresh-token identity
survives access-token renewal, with access-token identity as the fallback. Token
values remain transient and are not logged or included in mutation variables.
Logout or a different login does not refresh the new session's catalog. The cache
read is not awaited as part of the confirmed import, so a slow or failed refetch
cannot turn a committed write into an import error. Local result, success callback,
alerts and focus retain their mounted-instance ownership. The product page no
longer duplicates the modal's cache invalidation.

The same source probe also demonstrated that a delivered file-change event can
change native FileList before a pending guard returns, leaving the chooser label
out of sync with the retained file/token. Native OS-picker reachability was not
proven. Pending changes now restore the last accepted FileList; an empty accepted
selection uses an empty input value. Preview/confirmation ownership is unchanged.

Added component regressions use a real QueryObserver for a reopened catalog whose
old read finishes before late confirmation. They cover same-session refresh,
access-token renewal, access-only ownership, changed login, logout, absent session
and failed confirmation, while retaining detached UI/focus/alert protections and
same-tick preview/confirm file-list checks. The existing late-confirm browser
case now changes a synthetic product fixture on confirmed success and requires
exactly one refreshed catalog GET and the new product row. Other late outcomes
still require no extra read. All HTTP remains browser-fulfilled synthetic data;
no actual workbook or backend writes are added.

Local diff/context validation passes. Local Vitest did not start because the
workspace lacks its complete frontend dependencies (`vitest/config` unresolved);
Node is 24.19.0 rather than canonical 22. The authored React/browser regressions,
strict types, full tests and build require fresh exact-head GitHub CI. The earlier
green combined-tree evidence is not a pass for this correction. Independent review
and fresh artifacts remain required; no production release is claimed.
