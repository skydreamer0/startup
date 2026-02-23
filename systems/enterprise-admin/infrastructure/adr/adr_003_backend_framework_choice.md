# ADR-003: Backend Framework — Node.js + Express + TypeScript

## Status
**Accepted** (2026-02-23)

## Context
We need to choose a backend framework for the admin API. The system requires RBAC, JWT auth, RESTful CRUD, and production-grade middleware. The framework must integrate seamlessly with our chosen database (PostgreSQL via Prisma ORM, per ADR-001) and support strict type safety.

## Decision
We chose **Node.js + Express 5 + TypeScript** as the backend framework, with **Prisma ORM** for data access.

## Rationale
1. **Prisma Alignment**: Prisma is TypeScript-native. Using TypeScript in the backend eliminates the type mismatch between ORM models and application code.
2. **Ecosystem Maturity**: Express has the largest middleware ecosystem in the Node.js world, making it straightforward to integrate Helmet, CORS, and custom validation.
3. **Team Familiarity**: JavaScript/TypeScript is widely adopted, reducing onboarding friction.
4. **Zod Integration**: The API spec already specifies Zod for validation — a TypeScript-first library that works poorly with non-TS backends.

## Alternatives Considered
- **Fastify**: Faster, but smaller ecosystem and fewer community middleware.
- **NestJS**: More opinionated, beneficial for larger teams but adds complexity for a startup MVP.
- **Python/FastAPI**: Excellent for ML-heavy backends, but Prisma's primary support is TypeScript.

## Consequences
### Positive
- Full-stack TypeScript from DB to API to Frontend.
- Type-safe request validation with Zod.
- Large talent pool familiar with Express.

### Negative
- Express 5 (used here) has some breaking changes (e.g., read-only `req.query`) that require adaptation.
- Node.js single-threaded model requires careful async handling for CPU-intensive operations.
