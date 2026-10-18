# PR #138 cloud integration checkpoint — 2026-10-18

Status: partial, NOT merge-ready. Independent parent review pending. No push,
merge, deployment, production migration, device access or security change.

Sources: master `ab29b7224638b42e3bd96f606b84041ca353fb39`; original PR
`4160f17225e90b1daebde0bec5addad7bae8ce7e`. ProductList's sole conflict
retains both packageProductId and labelProduct, both launch buttons and dialogs.
No receipt foundation or package implementation was overwritten.

## Executed evidence

Cloud Node 22 with npm 11.21.0 / pnpm 10.34.6 and canonical frozen locks.
- Focused Admin MedicineLabelDialog, productPagination, productPackages: 34/34.
- Admin/backend builds, changed Admin file lint and context validation: exit 0.
- Dedicated PG15 container `pr138-cloud-pg`, loopback 55438, named database
  `pr138_cloud_test`, verified empty before migration. Applied master 13
  migrations, inserted synthetic legacy product, applied both medicine migrations.
- Real production HTTP app + JWT/RBAC + Prisma: five groups passed: legacy full
  row equality and six nullable fields; create/read; update/omission/package
  preservation; null clear/restore; tenant isolation/RBAC/validation/stock rejection.
- Cross-tenant GET returned 404; PUT was rejected through Prisma P2025 (currently
  HTTP 500), with unchanged owner data. This is isolation evidence, not a claim
  that the error contract is ideal. No delete Product endpoint exists.
- Initial harness comparison incorrectly included the changed product in the
  package response. Corrected to compare package records; failed attempts retained.
- Chromium launch aborted before any browser journey: SUID sandbox helper is not
  configured correctly. No no-sandbox flag, chmod or alternate browser route used.
- Owned PG container and its volume removed, including retained append-only
  synthetic package history. Browser assertions have NOT executed.

`backend/scripts/medicine-label-cloud.ts` is the saved bounded acceptance draft.
Its DB/HTTP section ran; its browser section is NOT validated and needs review
before reuse. It requires a previously prepared dedicated database containing
`pr138_legacy_snapshot`, a Vite loopback proxy on 5173 to app port 3138, and a real
print-disabled agent on 8765. It must not be pointed at an ambient database.
Its explicit environment marker is an opt-in, not ownership proof by itself:
reproduction must verify Docker ID/label, loopback binding and empty initial DB
before applying migrations. The API starts only on 127.0.0.1; sample JWT secrets
and agent token are synthetic test values only. The browser uses fixture JWTs,
not login UI. Linux fallback glyphs cannot prove Windows CJK paper rendering.

Full execution commands, outputs, exit codes, original source bundle, patches,
artifact metadata, migration fixture SQL and hashes are handed off separately in
`/workspace/pr138-evidence`. Initial exploratory reads/file edits are in the tool
transcript; the JSONL ledger covers operational checks and acceptance commands.

## Existing GitHub evidence and limits

PR #138 original head: pipeline 38779926129, 17 applicable successful checks and
branch-limited final-alpine skip/N/A. Eleven nonexpired artifacts listed, including
admin-margin, POS dialog/category/stock/SKU, pagination, audit, sequence, readiness,
HTTP recovery and pinned reviewed UI evidence. Their directory/digests were read;
Admin ZIP download was rejected Forbidden by redirected artifact storage, so no
ZIP contents or pixels were independently reviewed in this cloud run. No retry
through another route was attempted.

Unchanged local agent Python source retains historical 52/52 and Windows/BLE
reports as historical component evidence only. No unchanged full suite was rerun.
ProductList changed: prior Admin screenshots, package UI integration and Product
browser flows do not accept this new integration. The existing workflow has no
medicine browser/loopback journey. Passing generic DB jobs is not medicine CRUD
acceptance. Existing POS and receipt foundation results retain their original
subjects, never the new candidate's head.

Reference PR subjects: #142 `8dc4c6f95f54cf69bb4553b158eb8f5a97c01136`
(pipeline 38980011418); #143 `3617f2249c3df56265f88a6c5b9efdca5b6c948c`
(pipeline 38983401033); #144 `56c66be136810248c4ae8db603d507e79a7ef0e6`
(pipeline 38993403153). Their live bodies/checks were archived. #142 contains
package real-API/PG/browser evidence; #143 bounded owned-browser lifecycle;
#144 is unwired receipt foundation, not receipt UI acceptance. Older failed CI
entries in their bodies remain historical, not current-head results.

## Next step requiring external execution decision

Parent independently review integration diff and five DB groups, then select the
existing GitHub-hosted browser/owned-PG route for a new candidate-specific label
journey. Reuse the existing ownership/lifecycle/source-hash/report protections;
do not count old screenshots as new acceptance. Normal PR update would trigger
existing CI, but does not by itself add the missing medicine journey. No workflow
was edited and no push or dispatch was requested/performed here.

Windows install/restart, actual deployed Origin permissions, BLE/disconnect,
no-paper/unknown outcome, v9 paper readability/direction/physical QR remain NOT
RUN. #137 and parent pharmacy gates remain open.
