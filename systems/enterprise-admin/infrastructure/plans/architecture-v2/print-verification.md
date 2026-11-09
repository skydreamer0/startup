# AR-00 local print source and offline controls

This supplement maps the local BLE medicine-label bridge. It does **not** complete AR-00 AC01 or AR-18, approve printing, or cover POS WebUSB/receipt devices.

## Reproduce from the repository root

```sh
python3 scripts/architecture/verify-print-inventory.py
python3 scripts/architecture/test_print_inventory.py
python3 scripts/architecture/test_print_worker_controls.py
```

Python 3.11+ standard library is sufficient. No dependency installation or application import is needed. The verifier reads source/config/test files, not an existing printer token. It prunes `private/` (including `captures/private/`), runtime/cache/virtual-environment directories and generated preview files before descent. The JSON inventory lists these exclusions. Unreviewed source additions outside those exclusions fail closed. Private/runtime contents are deliberately outside coverage.

## What is checked

- `print-inventory.json` records the 24 maintained module files plus three Admin UI references and ADR-023. File bytes, Git blobs, Python AST facts, symbol locations, imports, call names, relative-module closure, project entry points and dependencies are checked without executing application code.
- `print-effects.json` maps 26 reviewed entry points/effect-bearing helpers to AR-18 and its acceptance IDs. Its 33 existing Python test references are resolvable **source citations**, not freshly run or sufficient runtime evidence. Missing coverage is explicit.
- The new inventory controls reject omitted files/effects/tests, wrong owners/checks, invented PASS states, source drift, added writers and changed AST facts even when outer file hashes are refreshed. The test suite also proves synthetic private sentinels are not traversed, read or copied.
- New worker/transport controls execute unchanged, selected AST definitions with explicit stdlib dependencies, fake BLE endpoints, a finite queue and temporary synthetic receipts. They cover durable reservation before enqueue/send, duplicate/conflict/restart behavior, failed persistence, unverified/unknown outcomes, no retries, explicit-send guards, one-session two-copy writes, profile/name rejection and bounded notification storage.
- These tests do not import the application, render labels, run HTTP listeners, start a real worker thread or connect to a device. The stdlib event loop can create an internal socketpair. The reviewed-code harness is **not a security sandbox for arbitrary future Python code**.

## Important source findings

`scan_ble.py` forwards arbitrary argv to the CLI, including guarded `print --send`; its read-only docstring is not an enforcement boundary. Printing-disabled API state still creates the report directory. `submit` relies on its HTTP caller for authorization, enabled mode, hash and key checks. A receipt replacement is not a demonstrated fsync/power-loss guarantee. BLE acknowledgments remain physically unverified, and any attempted write with uncertain outcome must not be retried automatically. The experimental transport and Windows diagnostics are separate entries, not silently covered by API tests.

## Limits and gates

The existing pytest suites, full module import, rendering/fonts, HTTP/browser/Origin integration, Windows startup/recovery, BLE devices, paper/scanning, store acceptance and broader HTTP/DB flows remain **NOT_RUN** here. No original runtime, schema, migration, dependency, workflow or canonical acceptance ledger is changed. These checks are manually invoked and are not newly wired into hosted CI. Coordinated edits to reviewed code and its pins still require independent review; AST shape is not a whole-program semantic proof.

AR-00's five issue checkboxes, AR-01 dependency, D01–D09, G0–G7 and activation remain unchanged. Keep #205 Draft. See the dedicated [verification receipt](../../verification/architecture-v2/ar00-print-20261109/README.md) for exact source identities, fresh results, review corrections and remaining gaps.
