# Authorization Policies (Rego)

Single source of truth for all authorization rules, authored in Rego.
Compiled into bundles by the OPA bundle server and pulled periodically
by every OPA agent (monolith + each microservice).

## Structure
- `rbac.rego` — role-to-permission mappings
- `abac.rego` — attribute-based rules (ownership, context)
- `*_test.rego` — policy unit tests (`npm run opa:test`)
