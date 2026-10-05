# Architecture Decision Records (ADR)

## 1. Context
At [startup], we maintain this directory to record significant architecture decisions. This practice ensures that the "Why" behind our technical choices is preserved for current and future engineering team members, following Big Tech (Enterprise) engineering standards.

## 2. Methodology
Each ADR should follow the standard format:
- **Title**: Short and descriptive.
- **Status**: `Proposed`, `Accepted`, `Deprecated`, or `Superseded`.
- **Context**: What problem are we solving?
- **Decision**: What is the chosen solution?
- **Consequences**: What are the trade-offs (positive and negative)?

## 3. ADR Index
- [ADR-001: Choice of Relational Database for Core Data](adr_001_relational_database_choice.md)
- [ADR-002: Token-Based Authentication Standard (JWT)](adr_002_authentication_standard.md)
- [ADR-003: Backend Framework Choice (Express vs NestJS)](adr_003_backend_framework_choice.md)
- [ADR-004: CRM Identity Resolution and Timeline Modeling](adr_004_crm_identity_resolution.md)
- [ADR-005: Phase 3 Technical Debt Assessment & Service Layer Standardization](adr_005_phase3_technical_debt.md)
- [ADR-006: SaaS Multi-Tenancy Architecture](adr_006_saas_multi_tenancy.md)
- [ADR-007: 開發環境全面遷移至 PostgreSQL](adr_007_postgresql_migration.md)
- [ADR-008: POS Standalone SPA Architecture](adr_008_pos_standalone_spa.md)
- [ADR-009: External Accounting System Adapter Pattern](adr_009_accounting_adapter.md)
- [ADR-010: Float → Decimal Migration for Monetary Fields](adr_010_float_to_decimal_migration.md)
- [ADR-011: Production Deployment Topology](adr_011_production_deployment.md)
- [ADR-012: Shared UI Library Boundary Decision](adr_012_shared_ui_library_decision.md)
- [ADR-013: Conditional Sales Stock Debit](adr_013_conditional_sales_stock_debit.md)
- [ADR-014: Eligible Sale Batch Posting and Durable Allocations](adr_014_sale_batch_posting.md)
