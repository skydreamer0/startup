# System Architecture Specification

## 1. Purpose
Define the system architecture, dependencies, API standards, and infrastructure for the enterprise platform. This documentation serves as the source of truth for all development and deployment activities.

## 2. Engineering Standards
1. **Implementation Order**: DB Schema -> API Spec -> Backend Implementation -> Frontend UI -> Integration Testing.
2. **Naming Conventions**: Aligned with the global Data Dictionary. All fields must use `snake_case` across DB and API.
3. **Security**: Mandatory RBAC (Role-Based Access Control) for all endpoints.
4. **Reliability & Observability**: Driven by SLI/SLO, Error Budgets, and OpenTelemetry standards.

---

## 3. One-Page Architecture Diagram

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

## 4. Architecture Blueprint

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

## 4. Version Control
1. All API breaking changes must be documented in the `CHANGELOG`.
2. Dependencies must be locked in `package-lock.json` or equivalent.
3. Frontend and Backend versions are managed independently.
