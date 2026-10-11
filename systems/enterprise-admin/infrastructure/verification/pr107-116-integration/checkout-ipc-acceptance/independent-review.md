# Final independent IPC acceptance review

**Verdict: APPROVE the bounded two-file checkout test fix. No remaining priority findings. This is not merge authorization.**

Reviewed integration code: `f6ae1dd94cb2ac1c824f2e4befe824e787df0e55`, tree `aa5b4ecc2399aa84ed4069b384057a5e0eba48d7`.

Draft [PR #117](https://github.com/skydreamer0/startup/pull/117): `8123bd7f5ef3b2bf0d42fa94a611ed613b0b3f5e`, tree `9cbd9e837ca9fa6a2955b8667a9268d30c24c5ff`, directly based on master `83a1b15cf156c7b0b409ee96b2fabab67b9c74e4` and excluding #109.

Reviewed patch SHA256: `2cc8134d55f72973cb7f1a1181af925c80a9433c0e783f7e723d388a43c1e475`.

## Source and assertion review

The committed test and worker are identical between Draft #117 and the integrated head and match the reviewed proposal and remote file readback. The precommit IPC barrier, owned parent SIGKILL, observed-close cleanup guard, rollback checks, UNKNOWN result check, and new-process replay assertions remain intact. No assertion or acceptance gate was skipped or weakened.

## Inspected acceptance evidence

- Linux Draft #117, existing CI [run 38119293085](https://github.com/skydreamer0/startup/actions/runs/38119293085), attempt 1, Node `v22.23.3`: **9 sequence + 21 command + 38 stock + 5 mocked cases PASS**, zero failed or skipped. The real precommit crash/rollback/recovery case passed. Source, ownership, accepted and cleanup receipts agree on head, tree, workflow/run identity, service and database. The service binding was loopback only; ownership preflight found no public tables. All 28 business tables were zero before and after acceptance; the owned database and owned migration schemas were removed. Migration upgrade, duplicate, cleanup and integrated migration receipts passed, retaining append-only protections.
- All **19** Linux artifact source hashes were independently compared with the exact Draft commit and matched. **The artifact does not separately hash the checkout worker helper.** Its binding relies on the exact checkout head/tree and the separately verified committed helper; this is a provenance coverage limit, not an additional helper-hash claim.
- Windows Draft #117, Node `v22.22.3` / PostgreSQL `16.3`: **21/21 PASS**, zero skipped; all 28 business tables were zero before and after, and all five cleanup checks were true.
- Windows integrated head: **372 PASS / 0 FAIL / 81 skipped**; checkout recovery was **21/21 PASS**, including precommit crash, rollback, UNKNOWN and replay. Synthetic seed/audit rows remained until the proven-owned database DROP; all five cleanup checks were true. The broader run has no post-seed before-count receipt and must not be described as having zero residual rows before DROP.

Evidence reviewed: `evidence/ipc-linux-ci/sequence/` selected JSON fields; `evidence/ipc-draft-native-1/`; `evidence/ipc-integrated-backend-native-1/`; `evidence/ipc-pr-head-initial.json`; and sanitized `evidence/ipc-safe-acceptance.json`. Raw command environment receipts and whole CI logs were not read or reproduced.

## Remaining limits and handoff

- **Integrated Linux acceptance: NOT RUN.** WSL returned `E_ACCESSDENIED`; the action stopped without retry or access changes. Draft Linux results do not validate the full integrated Linux tree.
- The 81 skipped Windows cases remain unverified. The historical **371 PASS / 1 FAIL / 81 skipped** result at `9ce542d03737bbca835c41606079b29138cf1759` remains FAIL evidence; it was not retroactively changed.
- The Draft CI/CD pipeline remains **FAIL: 8 of 9 jobs passed**, including Backend CI; the shared SKU job failed in its category-native step, and its subsequent stock-browser step remains unverified. The passing 38-case PostgreSQL stock suite above is distinct from that skipped browser gate.
- The branch-scoped `final-alpine` check was skipped and is not a pass. #109 remains unresolved and was not rerun.
- Parent retains the final merge/gate decision. No Issues, PR merges, branch deletion, database access, test/job reruns, or external writes occurred during this independent review.
