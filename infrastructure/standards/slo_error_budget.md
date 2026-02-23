# SLI, SLO, and Error Budget Policy

## 1. Context
To align with Site Reliability Engineering (SRE) best practices from Big Tech, we use SLI (Service Level Indicators), SLO (Service Level Objectives), and Error Budgets to define our reliability targets and make data-driven decisions on when to freeze deployments.

## 2. Definitions
- **SLI (Indicator)**: What we measure. (e.g., API response time, HTTP status code success rate).
- **SLO (Objective)**: The target percentage we aim to hit. (e.g., 99.9% of API requests return 2xx in <300ms).
- **Error Budget**: The acceptable unreliability. If SLO is 99.9%, the budget is 0.1% of requests failing per rolling 30-day window.

## 3. Core SLO Definitions (Admin System)

### A. Auth & Login API
- **SLI**: Percentage of `/api/v1/auth/*` requests returning HTTP 2xx.
- **SLO**: `99.95%` (Must be highly available).
- **Error Budget**: ~21 minutes of downtime / month.

### B. Core Data API (Reads)
- **SLI**: Percentage of `GET /api/v1/admin/*` requests returning in strictly < 500ms.
- **SLO**: `99%`

### C. Write & Transaction API (Mutations)
- **SLI**: Percentage of `POST/PUT/DELETE` requests successfully completing without 5xx errors.
- **SLO**: `99.9%`

## 4. Error Budget Policy & Consequences
If a service depletes its Error Budget for the trailing 30-day window:
1. **Feature Freeze**: All non-critical feature deployments are halted.
2. **Focus Shift**: The engineering team MUST prioritize reliability fixes (Postmortems, Bug fixes, Tech debt) until the budget recovers.
3. **Review**: The team must present an incident review and remediation plan to stakeholders.
