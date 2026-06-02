# Testing Strategy & Pyramid

## 1. Context
To maintain a high deployment velocity without sacrificing stability, we follow the **Test Pyramid** principle advocated by Google and ISTQB. Tests must be automated, deterministic, and required to pass before any code is merged (CI Gate).

## 2. The Test Pyramid

### 2.1 Unit Tests (The Base - 70% Volume)
- **Scope**: Single functions, pure components, and isolated utilities.
- **Characteristics**: Very fast, no external network or DB calls (mock everything).
- **Target Coverage**: `> 80%` line coverage for business logic.

### 2.2 Integration / Contract Tests (The Middle - 20% Volume)
- **Scope**: Database interactions, API layer bounds, and BFF-to-Backend contracts.
- **Characteristics**: Tests the "glue" between components. May use an in-memory DB or Dockerized DB (Testcontainers).
- **Goal**: Ensure the data flows correctly between our internal boundaries.

### 2.3 End-to-End (E2E) E2E Tests (The Top - 10% Volume)
- **Scope**: Critical user journeys (e.g., User Login, Admin creating a new User role).
- **Characteristics**: Slowest, testing against a fully deployed Staging environment via browser automation (Playwright/Cypress).
- **Rule**: Only write E2E tests for the absolute most critical paths to avoid maintenance nightmares (flaky tests).

## 3. Pull Request Requirements
- A PR that introduces new features must include corresponding Unit/Integration tests.
- A PR that fixes a bug must include a regression test proving the bug is fixed.


## 4. Current CI Test Gates

- Backend CI runs Prisma client generation, lint, build, database setup/seed, and backend tests against PostgreSQL. Prisma engines are cached in CI to reduce dependency on repeated binary downloads.
- Admin UI CI runs lint, focused unit/render tests, and production build/type-check.
- POS UI unit/component tests run in CI with `pnpm --filter pos-ui run test`; Vitest is configured to include only `src/**/*.{test,spec}.{ts,tsx}` so Playwright E2E specs stay under the Playwright runner.
- POS Playwright E2E requires browser installation (`pnpm --filter pos-ui run test:e2e:install`) and a running backend with seeded POS data before `pnpm --filter pos-ui run test:e2e`. Browser installation downloads from Playwright/CDN hosts, so cloud/CI runners need network allowlisting or a pre-populated browser cache. Do not make POS E2E a default PR gate until the browser and backend/seed dependencies are deterministic in CI.
