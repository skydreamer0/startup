# ADR-011: Production Deployment Topology

## Status

Accepted

## Context

The system has three deployable web services: `backend`, `admin-ui`, and `pos-ui`. Both UI apps are SPAs and should be served as static assets. The backend owns `/api/v1/admin/*`, while POS must be reachable without colliding with the admin shell.

## Decision

Use Docker Compose for the production stack:

- `backend` runs the Express API and exposes port 3000 only inside the Compose network.
- `admin-ui` and `pos-ui` are built from the pnpm workspace and served by dedicated nginx containers.
- A top-level nginx reverse proxy is the only public HTTP entrypoint.
- The reverse proxy routes `/api/*` to `backend:3000`, `/pos/*` to `pos-ui:80`, and all other paths to `admin-ui:80`.
- The POS production image is built with `VITE_BASE=/pos/` so static assets and client routing work under the `/pos/` prefix.

## Consequences

Local production verification uses `docker compose up -d --build` from `systems/enterprise-admin`.

TLS termination can be added in front of, or inside, the top-level nginx service. Certbot-based TLS setup is intentionally deferred until the deployment host and DNS names are fixed.
