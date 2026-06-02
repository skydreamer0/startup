# Observability & Monitoring Standard

## 1. Core Philosophy
"If you can't measure it, you can't manage it." 
In our enterprise architecture, we use **OpenTelemetry (OTel)** as the vendor-neutral standard for collecting all observability data (Traces, Metrics, Logs). This avoids vendor lock-in and allows us to route data to any backend (Prometheus, Datadog, ELK).

## 2. The Three Pillars of Observability

### 2.1 Metrics (The "What is wrong")
Time-series data to track system health.
- **RED Metrics (For Services)**:
  - **R**ate: Requests per second.
  - **E**rrors: Failed requests per second.
  - **D**uration: Response times (P50, P90, P99).
- **USE Metrics (For Infrastructure)**:
  - **U**tilization: CPU/Memory usage %.
  - **S**aturation: Queue lengths.
  - **E**rrors: Disk/Network errors.

### 2.2 Traces (The "Where is it wrong")
Distributed tracing tracks a request as it moves through the API Gateway, BFF, Services, and DB.
- **Requirement**: Every incoming request must generate a unique `trace_id` at the edge (Gateway).
- **Propagation**: This `trace_id` MUST be passed in HTTP headers to all downstream services and attached to all log entries.

### 2.3 Logs (The "Why is it wrong")
Detailed context of discrete events.
- **Format**: All backend logs must be output in strict **JSON format**.
- **Context**: Must include `timestamp`, `level`, `trace_id`, and `user_id` (if authenticated).
- **Action**: Never log sensitive PII (Passwords, Social Security Numbers, full Credit Cards).

## 3. Incident Response
When a RED metric breaches a defined SLO threshold (see `slo_error_budget.md`), an alert goes to the on-call engineer via Slack/PagerDuty, containing direct links to the relevant traces and logs.


## 4. Production Monitoring Checklist

For deployment-time and first-response monitoring, use the checklist in [Production Runbook](production_runbook.md#7-monitoring-checklist). It operationalizes this standard for the current Docker Compose topology, including service health, audit logs, rate-limit signals, and database backup signals.
