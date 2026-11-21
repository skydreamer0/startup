# AR-00 bounded verification receipt

Tested/reviewed source: `b6ceab9ea87b027610f9cf7b4a5e043220107da1`, tree
`e5cdf6911a67ae83700f3d77160866cb86b23d46`, Node 22.23.4 on isolated Linux.
All executed current-source commands exited 0. Author and independent runs each
passed 56 tests, zero fail/skip; source route/model/fingerprint, context, plan
output and whitespace checks passed. Exact accepted-run raw files and SHA256 are
retained here; machine records are in the plan's evidence.json. The receipt commit does not
change the three reviewed scripts or application files.

Independent negative controls reproduced and rejected the original integration
lock deadlock, mixed-head completion, rewritten/deleted requirements, false
alternate-manifest sourceChecked claim and bare G-gate status activation. A full
synthetic 24-task DAG advanced without deadlock while D01–D09 stayed UNAPPROVED
and all real activation remained BLOCKED. Synthetic proof fixtures do not appear
in the actual evidence ledger and grant no application acceptance.

## Failures and narrower earlier results are retained

- `plan-tests-node22.log`: 47/47 on the initial f1edb6c source. Independent review
  subsequently demonstrated five missing validation protections. This result was
  insufficient and is not the accepted tooling baseline.
- `review-fix-attempt1.log`: 45/47 during uncommitted repair, failed because source
  CRLF lines were not normalized the same way as the original snapshot reader.
- `review-fix-attempt2.log`: 55/56 during uncommitted repair, failed the AR13-first
  scheduling expectation. The final repair adds stable dependency-first ordering.
- These two intermediate worktrees were not separately frozen. Logs preserve
  their failures, but are not exact-head reusable acceptance or reconstructed code.
- The two historical failed-run publication copies replace the cloud checkout
  absolute prefix with `<checkout>/` and strip trailing ASCII spaces/tabs.
  Assertions, failure counts, error text and source-relative locations are unchanged.
  [historical-log-transformations.json](historical-log-transformations.json) records
  each transformation count, original byte hash and published byte hash; original
  logs are retained outside the public repository. These two copies are explicitly
  normalized, not described as byte-for-byte raw logs. Accepted-run artifacts and
  their evidence hashes are untouched.

No parent Issue is closed. AR-00 remains active with its five source/requirements
acceptance items NOT_RUN rather than promoting focused script checks into full
completion. No database, migration, dependency install, live message, printer,
production, Preview, user-computer task or deployment was run for AR-00.

SourceChecked verifies only its documented endpoint/model/runtime-fingerprint
coverage; it does not authenticate external artifacts or prove all writer/data
flow/authorization semantics. New-head CI and a full source-inventory acceptance
review remain separate. Upstream #204's native evidence is not revalidated here.
