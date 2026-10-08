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

## Compatibility corrections after the first CI run

Run [37584372262](https://github.com/skydreamer0/startup/actions/runs/37584372262)
at head `931a9a1a2c1d888595fa72a010d4f2cefa328096` passed both full audits,
Admin, context and backend Docker/locked Prisma CLI smoke. Backend had five
LINE test failures: Vitest 4 correctly rejects an arrow function used as a
constructor implementation. The mock now uses a constructable function; all
six original LINE assertions pass locally. No runtime service was changed.

POS Docker failed because its build context omitted the shared checkout hash
contract JSON imported by an existing test that is included in TypeScript
checking. The builder now copies that one canonical file without removing
tests from the build. Its full Docker and HTTP recovery are rerun in CI.

`compatibility-raw.zip` retains the complete failed Backend/POS job logs and
the local LINE failure/success outputs; `compatibility-manifest.json` binds
the entries and corrected source files to their SHA256. Downloading job logs
successfully is not a passing job: the CI failure conclusions are explicit.
