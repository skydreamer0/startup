# ADR-002: Token-Based Authentication Standard (JWT)

## Status
**Accepted** (2026-02-23)

## Context
The system requires a secure method to authenticate users for API requests across the Admin Frontend and Backend.

## Decision
We chose **JSON Web Tokens (JWT)** as the standard for authentication tokens (Bearer Token).

## Rationale
1. **Statelessness**: Allows the backend to scale horizontally without need for centralized session storage (though Redis may be used for blacklisting).
2. **Standard-Based**: Widely supported by almost all backend and frontend frameworks.
3. **Mobile/Cross-Platform Ready**: Easier to manage across different client types compared to traditional Cookies.

## Consequences
### Positive
- Simplified backend architecture (no session lookup per request).
- Built-in expiration and payload delivery.

### Negative
- Tokens cannot be easily invalidated before expiration without a blacklist mechanism (Redis).
- Token size can grow if too much data is added to claims.
- Requires strict storage security on the frontend (localStorage vs HTTP-only Cookies).
