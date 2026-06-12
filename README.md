# Hybrid Authorization System

A hybrid monolithic-microservice web application with **centralized
authorization and distributed enforcement**, built around Open Policy
Agent (OPA). Authorization policies are authored once, in Rego, and
enforced locally by every component — the NestJS monolith and each
independently deployed microservice — without synchronous calls to a
central server at request time.

This repository accompanies the postgraduate thesis *"A Hybrid
Monolithic-Microservice Web Application Architecture with Centralized
Authorization and Distributed Enforcement."* Chapter 3 describes the
architecture implemented here; Chapter 4 reports the evaluation results
produced by the scripts in `scripts/`.

---

## Repository structure

```
hybrid-auth-system/
├── apps/
│   ├── monolith/            NestJS core application (auth, business logic, OPA middleware)
│   ├── gateway/              API Gateway — Tier 1 perimeter enforcement
│   ├── web/                  Next.js 14 frontend portal + admin dashboard
│   └── microservices/
│       ├── audit-log/        Consumes audit events from RabbitMQ
│       ├── notifications/    Notification delivery service
│       └── user-profile/     User profile management service
├── packages/
│   └── shared/                Shared TypeScript types & constants
├── policies/                   Rego authorization policies (single source of truth)
├── infra/
│   ├── docker/                 docker-compose for local dev infrastructure
│   ├── nginx/                  Reverse proxy / TLS config for production
│   └── opa-bundle-server/      Policy Administration Point (bundle compiler)
├── scripts/                     Load testing & evaluation metric scripts
└── .github/workflows/           CI/CD pipelines
```

---

## Architecture at a glance

| Tier | Component | Responsibility |
|------|-----------|-----------------|
| 1 | API Gateway | JWT signature/expiry validation, rate limiting, IP filtering, role-path ACL |
| 2 | Monolith OPA agent | Fine-grained policy evaluation for monolith-owned resources |
| 2 | Microservice OPA sidecars | Equivalent local policy evaluation per service |
| — | OPA Bundle Server | Compiles `policies/*.rego` and distributes bundles on a polling interval |
| 3 | Audit log service | Consumes permit/deny events from RabbitMQ, persists audit trail |

See `apps/*/README.md` for details on each component.

---

## Prerequisites

- **Node.js** ≥ 20 and **npm** ≥ 10
- **Docker** and **Docker Compose** (for local infrastructure)
- **OPA CLI** ([download](https://www.openpolicyagent.org/docs/latest/#running-opa)) — for policy testing/formatting
- **Git**

---

## Local Development

### 1. Clone and install dependencies

```bash
git clone <repository-url>
cd hybrid-auth-system
npm install
```

This installs dependencies for every workspace (`apps/*`,
`apps/microservices/*`, `packages/*`) via npm workspaces.

### 2. Configure environment variables

Each app reads its own `.env` file. Copy the example files and adjust as needed:

```bash
cp apps/monolith/.env.example apps/monolith/.env
cp apps/gateway/.env.example apps/gateway/.env
cp apps/web/.env.example apps/web/.env.local
cp apps/microservices/audit-log/.env.example apps/microservices/audit-log/.env
cp apps/microservices/notifications/.env.example apps/microservices/notifications/.env
cp apps/microservices/user-profile/.env.example apps/microservices/user-profile/.env
```

The local defaults are pre-wired to match the services started in step 3
(Postgres on `5432`, MongoDB on `27017`, RabbitMQ on `5672`, OPA on `8181`).

### 3. Start local infrastructure

```bash
npm run dev:infra
```

This brings up, via `infra/docker/docker-compose.yml`:

- **PostgreSQL** (`localhost:5432`) — users, roles, permissions, sessions
- **MongoDB** (`localhost:27017`) — OTP tokens, failed-attempt counters, transient audit events
- **RabbitMQ** (`localhost:5672`, management UI on `15672`) — event bus
- **OPA** (`localhost:8181`) — policy decision point, loaded from `policies/`

Stop everything with:

```bash
npm run dev:infra:down
```

### 4. Run database migrations

```bash
npm run db:generate    # generate Drizzle migration files from schema changes
npm run db:migrate      # apply migrations to the local PostgreSQL instance
```

### 5. Start the applications

Each app runs independently in its own terminal (or use a process
manager / tmux):

```bash
npm run dev:monolith        # NestJS monolith — http://localhost:3000
npm run dev:gateway          # API Gateway      — http://localhost:8080
npm run dev:web               # Next.js portal   — http://localhost:3001
npm run dev:audit-log         # Audit log service
npm run dev:notifications     # Notifications service
npm run dev:user-profile      # User profile service
```

All client traffic should go through the **gateway** (`:8080`), which
routes to the monolith and microservices according to resource path.

### 6. Working with authorization policies

Policies live in `policies/*.rego` and are the single source of truth
for both the monolith's OPA agent and every microservice's OPA sidecar.

```bash
npm run opa:fmt     # format Rego files
npm run opa:test    # run policy unit tests (policies/*_test.rego)
```

When running locally via `docker compose`, the OPA container mounts
`policies/` directly, so changes are picked up according to OPA's
configured polling/reload behaviour — no separate bundle build step is
required for local development.

---

## Running Tests

```bash
npm run test                              # all workspaces
npm run test --workspace=apps/monolith    # a single workspace
npm run opa:test                          # Rego policy tests
```

---

## Evaluation Scripts (Chapter 4 metrics)

The `scripts/` directory contains the load-testing and attack-simulation
tooling used to produce the metrics defined in Chapter 3, Section 3.5:

- **Policy Consistency Rate (PCR)** — compares decisions across the
  gateway, monolith, and each microservice for identical request contexts
- **Brute Force Prevention Rate (BFPR)** — simulated credential attack sequences
- **Authorization Enforcement Latency (AEL)** — per-tier OPA evaluation timing
- **Policy Propagation Delay (PPD)** — time-to-effect for policy updates
- **System Throughput Under Load (STL)** — concurrent session load testing

Run `scripts/README.md` for usage details on each script as they are added.

---

## Production Deployment

The production deployment targets a single **AWS EC2** instance (or
small fleet) with **Docker**, **PM2**, **Nginx**, and **GitHub Actions**
for CI/CD, matching the tooling specified in Chapter 3, Table 3.2.

### 1. Provision infrastructure

- **AWS EC2** instance (Ubuntu 22.04 LTS recommended)
- **Managed PostgreSQL** (e.g. Neon) — connection string set as a secret
- **MongoDB** — managed Atlas instance or self-hosted container
- **RabbitMQ** — managed CloudAMQP instance or self-hosted container
- **Keycloak** — for OIDC/OAuth2 identity management (containerized or managed)
- A domain name with DNS pointed at the EC2 instance's IP

### 2. Server setup

Install on the EC2 instance:

```bash
# Node.js 20, Docker, PM2, Nginx, Certbot
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs docker.io docker-compose-plugin nginx certbot python3-certbot-nginx
sudo npm install -g pm2
```

### 3. TLS certificates

```bash
sudo certbot --nginx -d yourdomain.com -d api.yourdomain.com
```

Certbot configures Nginx automatically and sets up auto-renewal.

### 4. Nginx reverse proxy

The Nginx configuration in `infra/nginx/` routes:

- `yourdomain.com` → the Next.js portal (`apps/web`)
- `api.yourdomain.com` → the API Gateway (`apps/gateway`), which in turn
  routes to the monolith and microservices

Copy the relevant config to `/etc/nginx/sites-available/` and enable it:

```bash
sudo cp infra/nginx/hybrid-auth.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/hybrid-auth.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 5. OPA bundle server

In production, OPA agents pull compiled bundles from the **OPA bundle
server** (`infra/opa-bundle-server/`) rather than mounting `policies/`
directly. This server:

1. Watches the Git-backed `policies/` directory for changes
2. Compiles updated bundles
3. Serves them over HTTPS to all enrolled OPA agents

Each OPA agent (co-located with the monolith and each microservice via
Docker) is configured with the bundle server URL and a polling interval
(default: 60 seconds, per NFR2 in Chapter 3).

### 6. Build and deploy

```bash
npm run build
```

The monolith and microservices run under **PM2** for process management
and zero-downtime reloads:

```bash
pm2 start apps/monolith/dist/main.js --name monolith
pm2 start apps/microservices/audit-log/dist/main.js --name audit-log
pm2 start apps/microservices/notifications/dist/main.js --name notifications
pm2 start apps/microservices/user-profile/dist/main.js --name user-profile
pm2 start apps/gateway/dist/main.js --name gateway
pm2 save
pm2 startup   # configure PM2 to start on boot
```

The Next.js portal is typically built and served separately (e.g. via
`next start` under PM2, or deployed to a static/edge host).

### 7. CI/CD (GitHub Actions)

`.github/workflows/` contains the deployment pipeline:

- On push to `main`: install, lint, test, build
- On success: SSH into the EC2 instance, pull latest code, run
  migrations, rebuild affected services, and reload via PM2
  (`pm2 reload <app-name>` for zero-downtime restarts)

Secrets required in the GitHub repository settings:
`EC2_HOST`, `EC2_SSH_KEY`, `DATABASE_URL`, `MONGO_URI`, `RABBITMQ_URL`,
`JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `OPA_BUNDLE_SERVER_URL`.

### 8. Verifying the deployment

After deployment, confirm:

- `https://api.yourdomain.com/health` returns `200 OK` from the gateway
- Each OPA agent reports a healthy, recently-pulled bundle:
  `curl http://localhost:8181/health?bundle=true`
- PM2 shows all processes online: `pm2 status`
- Nginx access logs show traffic being routed correctly

---

## Environment Variables Reference

Each app's `.env.example` documents its required variables. Common ones:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (Neon in production) |
| `MONGO_URI` | MongoDB connection string |
| `RABBITMQ_URL` | RabbitMQ/CloudAMQP connection string |
| `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` | RS256 key pair for token signing/verification |
| `OPA_URL` | Local OPA agent address (e.g. `http://localhost:8181`) |
| `OPA_BUNDLE_SERVER_URL` | Policy Administration Point URL (production) |
| `KEYCLOAK_ISSUER_URL` | OIDC issuer URL for Keycloak |
| `BCRYPT_COST_FACTOR` | bcrypt hashing cost (minimum 12 per NFR1) |
| `LOCKOUT_THRESHOLD` | Failed attempts before account lockout (default 5) |
| `LOCKOUT_DURATION_MINUTES` | Lockout duration (default 15) |


