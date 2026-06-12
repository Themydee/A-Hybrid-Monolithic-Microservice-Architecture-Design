# Monolith (NestJS)

Core application: business logic, authentication (bcrypt + JWT issuance),
failed-attempt tracking and lockout, and the OPA middleware that performs
local policy evaluation for every protected request.

## Key directories
- `src/auth/` — login, JWT strategy, lockout logic
- `src/users/`, `src/roles/` — user and role/permission management
- `src/opa/` — OPA client + middleware (Tier 2 enforcement)
- `src/db/` — Drizzle ORM schema + migrations (PostgreSQL)
- `src/common/` — shared filters, interceptors, decorators
