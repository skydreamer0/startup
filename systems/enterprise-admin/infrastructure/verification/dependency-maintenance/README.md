# Dependency maintenance evidence

`local-raw.zip` contains unedited command output and command/exit metadata for
both before/after audits, clean strict installs, final frontend tests/builds,
backend generation/build/lint, shared and HTTP-harness type checks, CSV/Excel
regressions and context/lock boundary validation. `local-manifest.json` records
SHA256 for every entry and the source files verified at this stage.

Both final full dependency audits have zero advisories. Admin: 67 tests passed;
POS: 193 passed. CSV/Excel mocked regressions: 11 passed. The earlier CSV/Excel
attempt failed because synthetic environment variables were absent; that failed
raw output remains in the archive alongside the successful rerun. POS emits the
existing jsdom navigation-not-implemented diagnostics while all 193 assertions
pass. No existing test assertions or skips were removed.

Full PostgreSQL tests, real HTTP restart recovery and all three Docker builds
are verified separately by the four required remote CI jobs. Local Docker was
not available; this archive does not claim those operations ran locally. The
PR records the final commit, CI run, job results and counts once completed.

Installation policy: [dependency_management.md](../../standards/dependency_management.md).
No pharmacy business or operational acceptance gate is changed by this work.
