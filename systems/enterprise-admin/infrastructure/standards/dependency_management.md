# Dependency installation and update policy

Use Node.js 22 (minimum 22.12). CI and Docker use the same runtime major.
Each package belongs to exactly one installation boundary:

| Boundary | Canonical lock | Package manager |
| --- | --- | --- |
| `backend/` | `backend/package-lock.json` | npm 11.21.0 |
| `admin-ui/`, `pos-ui/`, `packages/*` | `pnpm-lock.yaml` at system root | pnpm 10.34.6 |

The backend remains independently installable because its Docker context and
HTTP recovery harness consume its own dependency tree. It is excluded from the
pnpm workspace. Do not add frontend package-lock files or nested pnpm locks.
`scripts/validate-dependency-locks.mjs` enforces these boundaries in CI.
Version pins live in the two packageManager fields and must match CI/Docker.

From `systems/enterprise-admin`:

```bash
npm install --global npm@11.21.0 pnpm@10.34.6
npm --prefix backend ci
pnpm install --frozen-lockfile
npm --prefix backend run db:generate
npm --prefix backend run dev
# In separate terminals:
pnpm --filter admin-ui run dev
pnpm --filter pos-ui run dev
```

Root build/test/lint scripts explicitly include the standalone backend.
Root `dev` runs frontend packages; `dev:backend` starts the API separately.
Running npm scripts after installation is fine; frontend installation uses pnpm.

For updates, change the owning manifest, regenerate only its canonical lock,
then prove strict installation, audit, lint/tests/build and affected Docker images.
The earlier baseline passed both full audits with zero advisories; audit results
are time-specific, not a permanent property of the lockfiles. CI runs
`npm audit --audit-level=low` and `pnpm audit --audit-level=low` without suppression.
Dependabot manages weekly patch/minor updates for both boundaries; runtime and
dependency major migrations require explicit compatibility review.

The POS image decoder stays on exactly `zxing-wasm@3.1.2`. Its reader guard,
writer fixtures and bundled WASM must move together with native decoding and
browser/offline acceptance. Dependabot excludes its routine patch/minor updates;
other frontend updates and security checks remain enabled. A decoder upgrade
requires a dedicated compatibility change rather than a manifest-only update.

Vitest 4.1.11 removes the old Tinypool dependency and retains the existing test
assertions. Axios is at least 1.20.0; Router 7.18 resolves advisories without v6
patches and is used through the existing declarative routing APIs.
CSV parse 7 is validated against the existing CSV/import regressions.
Constructor mocks must use constructable functions/classes with Vitest 4.
The POS Docker builder also copies the canonical checkout hash contract JSON
required by the existing TypeScript-checked contract tests.

Prisma stays on 6.19.3: both the client and migration CLI are runtime dependencies.
The backend container invokes its installed CLI and never downloads a new CLI
when starting. Overrides are limited to Prisma config's deepmerge-ts 8.0.2
(prototype-pollution fix) and ExcelJS's uuid 11.1.1 (CommonJS v4 API retained).
Prisma generation/migrations and DB-backed CSV/Excel regressions must pass.

### November 2026 security compatibility follow-up

Vite is at least 6.4.5 (GHSA-8g5g-mxqh-grgj); the frontend workspace pins
follow-redirects 1.16.2 (GHSA-mrwp-f3q8-3g9p). The workspace also pins minimatch
11.0.1 for GHSA-g3hv-75wg-m249. Backend minimatch overrides are deliberately
scoped to ESLint/config-array/eslintrc, typescript-estree and readdir-glob.
These consumers use the retained constructor/match or named minimatch API.
This extends the Prisma/ExcelJS exceptions above; it is not permission for
unreviewed major upgrades elsewhere.

Do not apply a global backend minimatch override: glob 7 relies on the old
RegExp `_glob` field, and a real recursive-glob probe fails with minimatch 11.
Its old minimatch remained visible to the unchanged security gate. On the
PR #174 candidate dated 2026-11-02, frontend audit reported zero vulnerabilities; backend
audit failed with seven moderate affected-package entries through the
ExcelJS/archive/glob/rimraf chain. That was a partial remediation, not CI-ready
or deployment approval. It required a compatible archive dependency migration;
never suppress the advisory or weaken the threshold.

The subsequent archive-chain candidate keeps ExcelJS 4.4.0 and Archiver 5.3.2
unchanged. Two exact, scoped overrides replace the vulnerable dependency paths:
`exceljs > unzipper = 0.12.3` removes the fstream/rimraf/glob-7 chain, and
`archiver-utils > glob = 14.0.3` supplies the retained synchronous `glob.sync`
API with patched minimatch. This is not a global minimatch override, an
ExcelJS downgrade, or a local fork of third-party security code. Do not use
the newer glob as a drop-in replacement for arbitrary old callback consumers;
the remaining archive-utils consumers use its synchronous API. Glob result
ordering is not a new application contract.

This candidate's canonical backend audit returned zero vulnerabilities on
2026-11-02; that does not alter PR #174's historical seven-moderate result.
Run `node --test scripts/archive-dependency-compat.test.cjs` in addition to
the suite below. The extra cases exercise both actual archive-utils consumers,
positive/negative glob filtering, ExcelJS streaming write/read with multiple
worksheets and shared strings, archive output selection, and malformed ZIP
rejection. They are manual developer checks, not CI wiring or 4070/device
acceptance. Final exact-head CI, independent review and applicable real-data
boundaries still govern readiness; no store deployment is implied.

After both canonical installs, run
`node --test scripts/dependency-security-compat.test.cjs` from the repository
root. It checks glob/readdir matching, an ExcelJS streaming ZIP roundtrip,
actual ESLint resolution and cross-realm sensitive-header stripping through
loopback redirects. These synthetic checks do not replace native API/PG,
browser, hardware or full CI acceptance. Preserve original failed attempts
and verify all applicable checks for the final published head.

Admin used the shadcn CLI package only for its stylesheet. The original locked
4.8.0 `dist/tailwind.css` is retained byte-for-byte at
`admin-ui/src/styles/vendor/shadcn.css` with its MIT license and provenance.
This removes a CLI-only unpatched braces dependency from the application graph.
Scaffolding tools are not application runtime dependencies.

Historical verification documents retain the tool/version used at that time;
use this policy and current CI for new work.
