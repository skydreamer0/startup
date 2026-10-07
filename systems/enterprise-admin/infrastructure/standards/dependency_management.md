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
Both install boundaries currently pass full audit with zero advisories; CI runs
`npm audit --audit-level=low` and `pnpm audit --audit-level=low` without suppression.
Dependabot manages weekly patch/minor updates for both boundaries; runtime and
dependency major migrations require explicit compatibility review.

Vitest 4.1.11 removes the old Tinypool dependency and retains the existing test
assertions. Axios is at least 1.20.0; Router 7.18 resolves advisories without v6
patches and is used through the existing declarative routing APIs.
CSV parse 7 is validated against the existing CSV/import regressions.

Prisma stays on 6.19.3: both the client and migration CLI are runtime dependencies.
The backend container invokes its installed CLI and never downloads a new CLI
when starting. Overrides are limited to Prisma config's deepmerge-ts 8.0.2
(prototype-pollution fix) and ExcelJS's uuid 11.1.1 (CommonJS v4 API retained).
Prisma generation/migrations and DB-backed CSV/Excel regressions must pass.

Admin used the shadcn CLI package only for its stylesheet. The original locked
4.8.0 `dist/tailwind.css` is retained byte-for-byte at
`admin-ui/src/styles/vendor/shadcn.css` with its MIT license and provenance.
This removes a CLI-only unpatched braces dependency from the application graph.
Scaffolding tools are not application runtime dependencies.

Historical verification documents retain the tool/version used at that time;
use this policy and current CI for new work.
