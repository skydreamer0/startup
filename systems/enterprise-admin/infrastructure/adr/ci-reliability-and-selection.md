# CI reliability and conservative selection

Date: 2026-10-19
Status: Proposed; independent review and exact-head hosted CI required.

## Context

An anonymous immutable GitHub commit API request exhausted the shared runner IP
quota before reviewed POS browser execution. Checkout credentials do not
authenticate Node fetch. A bounded retry after reset succeeded, preserving the
original failure. Local Git alone cannot replace server corroboration of SHA,
tree and ordered parents. Unrelated UI-only changes also need not start every
heavy worker, but required status contexts must remain trustworthy.

## Decision

Use the workflow's existing ephemeral contents:read token only in a metadata
preflight step, with a validated fixed api.github.com commit URL, redirect:error,
a bounded timeout and redacted diagnostics. No new credential, grant or persistent
access is created. Browser/subject subprocesses never receive the metadata token. An accidentally
inherited token is deleted before a fixed, secret-free error is thrown.
The preflight writes an exclusive runner-temp proof, bound to repository, run,
attempt, execution SHA, checkout tree, ordered parents and current tracked QA
blobs. Its SHA-256 is transferred by the producing step's output. The consumer
requires that digest, reconstructs every local binding and rejects missing,
changed, replayed or extra-field proof data. Original setup independently checks
QA source equality, clean tracked/untracked/ignored files and hidden index flags.

The digest is integrity binding between steps, not a signature or authority for
arbitrary PR content. The reviewed workflow and preflight remain the trust root;
PRs changing them need review. A malicious replacement of the entire workflow is
not prevented by a digest generated in that same workflow. No proof from PR files,
artifacts, another run or a moving branch is accepted as server evidence.

Genuine local exact-head reproduction remains API-free and explicitly records
commitApiVerified:false. Any CI, GitHub, runner or proof context forces the full
CI proof path, even when its identity fields are empty; missing proof never
downgrades to local mode.

Use a conservative local-Git planner and always-running required aggregates,
as specified in test_pyramid.md. Existing services, test commands, timeout and
security settings remain intact. All selected PG/native/browser children affect
the corresponding required gate. Keep separate FEFO/checkout workflow checks
unchanged except cancelling superseded PR runs.

## Validation and rollback

Test exact URL/header/redirect handling, failed API and secret-safe diagnostics,
proof mutation/replay/source changes, planner fallback and full aggregation truth
tables. Verify parsed workflow wiring and preservation of original worker steps.
Hosted exact-head CI is required before claiming actual browser or PostgreSQL
execution. This branch is based on merged master; camera and receiving Drafts
remain independent. Roll back the complete scheduling/proof delta together; do
not restore anonymous fallback or leave browser consumers without their producer.
