# ADR-001: Choice of Relational Database for Core Data

## Status
**Accepted** (2026-02-23)

## Context
We need a primary database for the startup administrative system. The database must handle complex relationships (RBAC, User profiles, Audit logs) and ensure high data integrity (ACID).

## Decision
We chose **PostgreSQL (v15+)** as our primary relational database.

## Rationale
1. **ACID Compliance**: Industry-leading data integrity for financial and administrative transactions.
2. **JSONB Support**: Outstanding performance for semi-structured data (like audit log diffs) while maintaining relational benefits.
3. **Ecosystem**: Large-scale enterprise support, widespread cloud availability (AWS RDS, GCP Cloud SQL), and excellent ORM support.
4. **Advanced Features**: Robust support for Row-Level Security (RLS) and full-text search.

## Consequences
### Positive
- Strict schema enforcement prevents data corruption.
- Powerful querying capabilities for complex admin reporting.
- Easy to find experienced PostgreSQL DBAs and developers.

### Negative
- Schema migrations require more careful planning compared to NoSQL.
- Vertical scaling is more common than horizontal, although distributed options exist.
