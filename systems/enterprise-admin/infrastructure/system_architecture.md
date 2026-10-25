# System Architecture Specification

## Current architecture and document purpose

For the implemented architecture, read [the repository overview](../../../docs/architecture.md)
and [system context](../CONTEXT.md). The active system has two React/Vite SPAs,
`admin-ui` and `pos-ui`, sharing one Express/Prisma/PostgreSQL modular monolith.
The Windows loopback label agent is a separate workstation component, not a
cloud inventory service. POS is already implemented; no new POS system is planned
by this document.

Requirements/acceptance remain in [#31](https://github.com/skydreamer0/startup/issues/31)
and [#37](https://github.com/skydreamer0/startup/issues/37). Accepted [ADRs](adr/),
[API contracts](api/api_spec.md), Prisma schema/migrations and [standards](standards/)
each govern their own subject. [ROADMAP](../ROADMAP.md#current-status) links the
current implementation/evidence snapshot. This file is an index and historical
reference, not a second authority over those sources.

<a id="historical-blueprint"></a>
## Historical blueprint

The sections below preserve the earlier generic enterprise design. They do not
assert that every pictured service exists or authorize new dependencies, security
changes or deployment. In particular, API/BFF microservices, IdP/OIDC, Kubernetes,
message brokers, NoSQL, cache/search and OpenTelemetry are not the verified
runtime topology. The old blanket snake_case rule is not an instruction to rename
current Prisma/API fields; follow the actual contract and naming standards.
Historical links are reference documents, not acceptance evidence.

### Original purpose
Define the system architecture, dependencies, API standards, and infrastructure for the enterprise platform. This was the original blueprint's purpose, not current deployment authority.

## 2. Historical engineering assumptions
1. **Implementation Order**: DB Schema -> API Spec -> Backend Implementation -> Frontend UI -> Integration Testing.
2. **Naming Conventions**: Aligned with the global Data Dictionary. All fields must use `snake_case` across DB and API.
3. **Security**: Mandatory RBAC (Role-Based Access Control) for all endpoints.
4. **Reliability & Observability**: Driven by SLI/SLO, Error Budgets, and OpenTelemetry standards.

---

## 3. Historical generic architecture diagram

```mermaid
flowchart LR
  %% 用戶流量路徑
  subgraph U[用戶端]
    W[Web 瀏覽器]
    M[行動 App]
  end

  subgraph E[邊緣與入口]
    DNS[DNS]
    CDN[CDN]
    WAF[WAF / DDoS 防護]
  end

  subgraph F[前端層]
    FE[Web 靜態資源 / SPA]
  end

  subgraph I[身分與存取]
    IdP[IdP / OIDC]
    AUTH[Auth Service]
  end

  subgraph A[API 與整合層]
    GW[API Gateway]
    BFF[BFF]
  end

  subgraph S[後端服務層]
    S1[領域服務 A]
    S2[領域服務 B]
    S3[共用能力服務 C]
    BUS[事件匯流排 / Message Broker]
  end

  subgraph D[資料層]
    RDB[(RDBMS)]
    NOSQL[(NoSQL)]
    CACHE[(Cache)]
    SEARCH[(Search)]
    OBJ[(Object Storage)]
  end

  %% 平台與交付治理路徑
  subgraph P[平台與自動化]
    K8S[容器平台 / Kubernetes]
    SEC[Secrets 管理]
    IAM[IAM / 權限控管]
  end

  subgraph O[可觀測性]
    OTEL[OpenTelemetry]
    MON[監控與告警]
    LOG[集中式日誌]
    TRACE[分散式追蹤]
    MET[度量指標]
  end

  subgraph C[CI/CD]
    GIT[Git Repo]
    CI[CI: Build + Test + 掃描]
    CD[CD: 部署 + 回滾]
  end

  %% 連線
  W-->DNS-->CDN-->WAF-->FE-->GW
  M-->DNS
  GW-->AUTH
  AUTH<-->IdP
  GW-->BFF
  BFF-->S1
  BFF-->S2
  S2-->BUS-->S3

  S1<-->RDB
  S2<-->NOSQL
  S1-->CACHE
  S2-->SEARCH
  S3-->OBJ

  S1-->OTEL
  S2-->OTEL
  S3-->OTEL
  OTEL-->MET-->MON
  OTEL-->LOG
  OTEL-->TRACE

  GIT-->CI-->CD-->K8S
  SEC-->K8S
  IAM-->K8S
```

---

## 4. Reference document index

### A. Governance & Standards
- [Engineering Standards & Policies](standards/README.md)
- [Architecture Decision Records (ADR)](adr/README.md)

### B. Frontend Architecture
- [Tech Stack & State Management](frontend/tech_stack.md)
- [UI Components & Layout](frontend/ui_components.md)
- [Routing & Permissions](frontend/routing.md)
- [API Client & Interceptors](frontend/api_client.md)

### C. Backend Architecture
- [Backend Framework & Server Config](backend/backend_config.md)
- [Database Schema Definition](backend/database_schema.md)
- [API Gateway & Routing](backend/api_gateway.md)
- [RBAC Middleware Implementation](backend/rbac_middleware.md)

### D. API & Integration
- [RESTful & GraphQL Spec](api/api_spec.md)
- [Websocket & Real-time Updates](api/websockets.md)
- [Error Codes & Response Format](api/error_handling.md)

### E. Infrastructure & DevOps
- [CI/CD Deployment Pipelines](devops/cicd_pipeline.md)
- [Environment Variables & Secrets](devops/environments.md)
- [Logging & Monitoring](devops/monitoring.md)

---

## 5. Historical version-control notes
1. All API breaking changes must be documented in the `CHANGELOG`.
2. Dependencies must be locked in `package-lock.json` or equivalent.
3. Frontend and Backend versions are managed independently.
