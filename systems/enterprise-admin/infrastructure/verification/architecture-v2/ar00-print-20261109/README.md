# AR-00 print bridge source/offline receipt

Date: 2026-11-09. Repository: skydreamer0/startup. Issue #180, Draft PR #205.

## Result and exact subject

**PASS only for this bounded source/offline slice. Full AC01 remains NOT_RUN.**

- Base: `5e3d6bab7e89a1bad53dcf3a6b385947fbd9111e`, tree `3d18d4211946e8dc02d4780a20dfba2efe512343`.
- Reviewed local source: `f0ba66ecb16739a006bcc9e40e994ea509cb85ec`.
- Published equivalent source: `a18e95b945d79dcd2624d9af09e3bc6bd66085a1`.
- Both source trees: `8492e69d90f3b808f7121d7205c49c143d940833`. Equal trees do not transfer hosted CI identity.
- The final artifact head is recorded in the PR after publication, not embedded circularly into this receipt.

The complete base index has 1,359 leaf entries. All 231 materialized baseline files matched their remote Git blobs; 1,128 leaves were not materialized. This is not a full application checkout.

## Delivered and freshly checked

The six-file source change adds a verifier, two stdlib test suites, an inventory, an effect map and a scope guide. No existing application/runtime or acceptance ledger was changed.

- **28 pinned files**, **26 effect rows**, **33 existing test references** (23 unique symbols). The references are source citations only.
- Author and independent reviewer each ran **52/52** new tests: 28 inventory/negative controls and 24 source-derived worker/transport/wrapper controls. No failures or skips in final runs.
- Author separately reran **162/162** existing plan/seed/gate tests on Node 24.22.1, all three source verifiers, context validation, syntax and whitespace. These were not rerun by the print reviewer.
- Independent extra checks: no private-directory traversal, reads or copies; four metadata mutations rejected; two removed guards caught by tests.
- The final reproduction reran all 214 tests and the checks after the source freeze. See `final-reproduction/results.json` and logs.

The new tests execute unchanged selected AST definitions with controlled substitutes, synthetic receipts and fake BLE. No application-module import, HTTP listener, network connection, real worker thread or device operation occurs. Python's event loop can use an internal Unix socketpair. This is not a sandbox for arbitrary future code.

## Findings fixed before publication

The initial review requested changes: discovery could read synthetic files in private runtime directories before rejecting them. It now prunes those directories before descent. Three inaccurate font/test mappings were corrected. Initial and final hashes, actual observations and limitations are retained in `independent-review.json`.

One initial author test failed because the wrapper's nested `import sys` replaced the test stub. The harness was fixed to patch argv, not the application. The actual failure log is preserved, with only its absolute checkout prefix replaced as documented in `log-provenance.json`.

The existing `scan_ble.py` wrapper accepts arbitrary CLI argv, including guarded `print --send`, despite its read-only docstring. The map records this accurately. Printing-disabled API construction still creates a directory. Receipt replacement is not proof of power-loss durability. BLE write acknowledgments never prove that a label printed.

## Reproduce

From a checkout containing the published source ancestry, with Python 3.11+, Node and Git:

```sh
python3 systems/enterprise-admin/infrastructure/verification/architecture-v2/ar00-print-20261109/reproduce.py
```

The script invokes only the listed offline checks, performs no installation, and saves fresh logs in a new temporary directory. Individual commands and exact result classifications are in `receipt.json`. The [independent probe replay](independent-probes/README.md) reproduces the original/fixed private-sentinel observations, metadata/guard mutations and optional 52-test capability audit. The author also reran that published script with `--audit-suite`; its supplemental result is `independent-probes/author-audit-replay.json`. Source specifications are in [print-verification.md](../../../plans/architecture-v2/print-verification.md).

Check this immutable artifact set from this directory:

```sh
sha256sum -c SHA256SUMS
```

## Not accepted by this receipt

Existing pytest/full-module imports, label rendering/fonts, HTTP/browser/Origin integration, real worker scheduling, Windows startup/recovery, physical BLE, paper/scanning and store acceptance remain **NOT_RUN**. Required Python dependencies were unavailable and were not installed. POS WebUSB/receipt devices, full HTTP writer coverage and DB/application acceptance are outside this slice. These manual suites were not newly wired into CI.

All five #180 checkboxes and canonical manifest/evidence remain unchanged. AR-00 remains active with overall NOT_RUN, AR-01 blocked, D01–D09 UNAPPROVED, G0–G7 NOT_RUN and activation BLOCKED. #205 stays Draft. No production data, real credential/target file, printer, user computer, merge or deployment action was performed.

Exact final-head hosted checks must be read separately after publication. Earlier green CI and these offline results do not authorize release.
