# HTTP source fingerprint representation fix

Date: 2026-11-09. Issue #180, Draft PR #205. **This does not complete AC01 or clear an external security finding by itself.**

## Subject and change

Base: `a8db89cb75ad2062f979c97194ba09acdcf977f9`, tree `e7c363ab792d47917b909cc799c55b2586cdb7b3`.

Reviewed local source: `d281e3039899fdcbad59d9c30f972a953b7a30d6`. Published equivalent source: `f1274af6fe5ce02d59182885ca44f595327d7a36`. Both source trees are `5dab462c41563b49f8f1c06e0e85c752ea4bd505`.

The old head's GitGuardian check reported a Generic Password in a source-fingerprint table. Independent machine comparison established that the flagged entry exactly matches the SHA256 of its versioned source file. Its value is deliberately not repeated in this receipt.

The fix represents all 27 fingerprints as explicit `{path, sha256}` records instead of using filenames as object keys. Four verifier/spec/test files change. All values, ordering and other specification fields remain equivalent. The map, contract tests, application, workflows and security configuration are unchanged.

## Fresh independent verification

- **291/291 tests passed**, no failures or skips: 77 HTTP, 162 existing plan/seed/gate and 52 print tests.
- All four source verifiers, context, syntax and whitespace passed.
- All 27 fingerprints match committed source bytes; the complete 1,493-leaf source tree changes exactly four files and preserves the other 1,489.
- Returned arrays and all 27 records are detached from the specification. Mutating a returned record leaves the pinned source metadata intact.
- Actual source-byte drift is rejected. Removing the byte-comparison clause makes the same drift pass, so the independent rejection witness catches that removed guard.
- Verification used 365 materialized committed files, not a full checkout. One uncommitted README update was excluded by reading its committed blob instead.

See [review.json](independent-review/review.json), the actual logs and the two replay scripts. Review hash: `23605c90209a51205d0435895f648b3ac4e2b95dcba15e44bdf38573fc266f6c`.

## Reproduce without printing fingerprint values

From the repository root:

```sh
python3 systems/enterprise-admin/infrastructure/verification/architecture-v2/ar00-http-fingerprint-label-20261109/independent-review/compare-committed-pins.py --repository . --base a8db89cb75ad2062f979c97194ba09acdcf977f9 --source f1274af6fe5ce02d59182885ca44f595327d7a36
node systems/enterprise-admin/infrastructure/verification/architecture-v2/ar00-http-fingerprint-label-20261109/independent-review/probe-fingerprint-records.mjs .
```

The first script reads committed source JSON and bytes without executing the application. The second uses synthetic in-memory drift and a disposable verifier copy; it does not edit application files. Both report booleans rather than fingerprint values. Exact test commands are in the review record.

From this receipt directory, verify its immutable files with `sha256sum -c SHA256SUMS`.

## Security and acceptance limits

The previous GitGuardian failure is preserved as a failure. That scanner reported scanning the whole PR, including earlier commits. **A new exact-head scan must establish whether this representation change clears the finding.** There was no dismissal, ignore, suppression, exception, security-setting change, rerun or history rewrite.

Prior HTTP and print receipts and their seals are untouched. The final artifact head and its natural CI outcomes are recorded in the PR after publication rather than embedded circularly here. Tree equality does not transfer CI identity.

Full HTTP/PG, application and device acceptance remain NOT_RUN for this slice. All five #180 checkboxes, canonical manifest/evidence, decision gates, activation gates and the AR-01 dependency remain unchanged. #205 stays Draft. No merge or deployment.
