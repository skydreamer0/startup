# AR-00 bounded closeout: CLI inventory and gate controls

Refs #180 and Draft #205. This is a tested source/inventory and planner-validation
slice, not completed AR-00, operational activation or store acceptance.

## Source and preservation

- Frozen remote base: `84d754b29332ed868f92fd3e954f90011a2d338e`, tree
  `d31409bb8ad7c7ecaa67bafb6a633db60a33be80`.
- Tested and independently inspected local source:
  `658e058f05304e9f9a03cc3d35ac299423bc9e46`.
- Published equivalent source object:
  `586f2baa8278a262521757bea8da629ba7111649`.
- Both source trees: `79df6dc6b2e8088623291a687ae07d3ed28796e3`.
- Full remote source readback compared all 1,285 leaf paths, modes, types and blob
  IDs without truncation: five changed existing files, one added gate suite and
  1,279 unchanged existing leaves. [Readback](source-tree-readback.json).
- The isolated source has 243 materialized, individually hash-verified files and
  complete tree metadata. It is **not a complete checkout or full git archive**.
  Missing unrelated objects were not fabricated or counted as inspected source.

The original CLI candidate files were recovered from retained edit procedures,
not from a preserved checkout. Its old 78/78 logs were unavailable. The recovered
gate test and historical 17/17 log exactly matched their retained SHA256 values;
the original receipt JSON could not be restored. [Recovery and exact hashes](receipt.json).
No recovered count is used as a fresh execution result.

The integrated gate suite explicitly updates its verifier pin to `c0710b7c...`
and explains that change. All original assertions still run. It does not silently
accept a changed verifier or skip the identity check.

## What changed

The verifier now checks all 13 backend package scripts, the separate Prisma seed
hook and the Docker final-stage CMD argv against source declarations. Each CLI
entry requires valid ownership, effect, AR destination and unique source
fingerprint. Commands remain inert strings. New negative tests reject missing,
substituted, duplicated or unsupported declarations.

The gate suite exercises the declared 24-task graph, all 276 task lock pairs,
all 512 policy-approval combinations, non-PASS evidence, independent review,
exact source/tree/scope and activation gates. Six guard-removal mutants must be
detected. Synthetic completion fixtures never enter the real manifest or ledger.

## New execution and limits

Node 24.22.1, isolated cloud workspace, no dependency installation or application
startup:

- [Plan/CLI tests](candidate-plan-tests.log): 78 passed, zero failed or skipped.
- [Gate tests](candidate-gate-tests.log): 17 passed, zero failed or skipped.
- [Source verification](candidate-source.log), [context validation](candidate-context.log),
  [syntax/whitespace/source-match checks](candidate-static.log): PASS.
- [Baseline diagnostic](baseline-cli-rejection-gap.log): the old verifier accepted
  three invalid CLI inventories. This is a recorded FAIL of the expected-rejection
  property, reproduced by the [pinned read-only probe](baseline-cli-gap-probe.mjs)
  with exit 1. New tests reject those same cases.
- [Historical 17/17 log](recovered-historical-17.log): preserved unchanged, not a new run.
- Node 22 focused execution, application build/lint/full suites, native API/PG,
  devices and store acceptance: NOT_RUN in this slice.
- New-head hosted CI is separate. Prior #205 CI does not validate a new commit.
  The new focused suites are manual commands, not newly wired into hosted CI.

Reproduce from repository root:

    node --test scripts/architecture/plan.test.mjs
    node --test systems/enterprise-admin/infrastructure/verification/architecture-v2/ar00-closeout-20261108/gate-acceptance.test.mjs
    node scripts/architecture/verify-plan.mjs --check-source
    node scripts/architecture/plan.mjs
    ./scripts/validate-agent-context.sh
    git diff --check

## Independent review

The [independent review](INDEPENDENT-REVIEW.md) confirms new 78/78 and 17/17 runs,
64 declaration/normalization controls, 11 actual-source probes with refreshed
fingerprints, and six guard-removal mutants detected by behavioral assertions.
The exact-command and rerunnable baseline-probe observations were resolved and
independently rechecked. No blocking implementation finding remained for this
bounded slice. The [pre-reference receipt](receipt-before-review-reference.json)
preserves the exact reviewed bytes; the final receipt only adds the review
reference and clarifies publication timing, avoiding circular hashes.

## Five acceptance items

The [machine-readable receipt](receipt.json) records commands, subjects, results,
artifact hashes and the independent-review boundary.

- **AC01: NOT_RUN for full acceptance.** Declaration coverage improved, but the
  curated Python entries, command target closure, actual activation and 96
  lexical write/raw candidates do not establish all-writer/data-flow authorization
  or complete semantic source-to-test ownership.
- **AC02: PASS for the declared planner.** DAG validity, unknown dependencies,
  overlap locks, three-worker bound and dependency completion were tested.
  No real worker was dispatched.
- **AC03: PASS for evidence bookkeeping.** New PASS, prior defect FAIL, zero new
  skipped cases and explicit NOT_RUN scopes are separate. Historical evidence is
  not reassigned to a new source or execution environment.
- **AC04: PASS for the pure planner/validator.** Engineering readiness is separate
  from the nine activation-only policy decisions and TEST_ONLY profiles. This is
  not approval of any policy or activation of application behavior.
- **AC05: PASS for the evidence/checkbox/activation boundary.** The latest
  [#180 readback](issue180-readback.json) remains open with all five AC boxes
  unchecked; manifest and evidence ledger blobs remain unchanged. Software
  completion is not G0–G7, device or store completion.

These bounded passes do not promote the canonical completion ledger. AR-00 stays
active with overall NOT_RUN, AR-01 blocked, D01–D09 UNAPPROVED, G0–G7 NOT_RUN and
activation BLOCKED. No issue or roadmap checkbox is changed.

## Known boundaries

The Docker reader intentionally rejects unsupported syntax rather than guessing.
It also conservatively rejects a literal `<<` inside otherwise valid JSON argv,
for example a JavaScript bitshift expression. That false rejection is not a
security bypass and is not fixed in this slice. External base-image inherited
startup behavior and transitive command execution are not analyzed.

The tools validate declarations and evidence shape, not the truth of arbitrary
supplied evidence or complete data-flow authorization. Read-only source checking
is not native database, browser, hardware or financial correctness acceptance.
No runtime, schema, migration, dependency lock, workflow, application assembly,
real data, printer, user computer, merge or deployment was changed or used.
