# Infrastructure

- `docker/` — docker-compose for local dev (Postgres, MongoDB, RabbitMQ, OPA)
- `nginx/` — reverse proxy + TLS config for production
- `opa-bundle-server/` — Policy Administration Point: compiles and serves
  policy bundles from `policies/` to all enrolled OPA agents
