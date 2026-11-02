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
Its old minimatch remains visible to the unchanged security gate. On the
2026-11-02 candidate, frontend audit reports zero vulnerabilities; backend
audit still fails with seven moderate affected-package entries through the
ExcelJS/archive/glob/rimraf chain. This is a partial remediation, not CI-ready
or deployment approval. A compatible archive dependency migration remains
separate work; never suppress the advisory or weaken the threshold.

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
