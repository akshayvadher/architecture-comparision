# Production Best Practices — Checklist

Scope: all 7 architecture projects in this repo (`clean`, `cqrs-es`, `cqrs-es-nestjs`, `ddd`, `hexagonal`, `n-tier`, `onion`). They share an identical stack (NestJS 11, Drizzle 0.39, PostgreSQL, Vitest 3, Biome 2.4, TypeScript 5.7 strict), so every item below applies to every project unless noted.

Legend: **[P0]** must-have before any production traffic · **[P1]** expected for anything real · **[P2]** mature-service polish

---

## What you already have (don't redo)

Shared baseline across all 7 projects:
- Global exception filter mapping domain errors → HTTP status codes
- Custom error hierarchy (7–8 domain errors per project; `ConcurrencyError` → 409 in CQRS/ES variants)
- Drizzle with connection pooling (`pg.Pool`) and transactions
- Unit + integration test split under Vitest
- Biome linting and formatting wired into `npm run lint`
- TypeScript strict mode (strictNullChecks, noImplicitAny)
- docker-compose.yml for local Postgres
- Drizzle migrations

CQRS/ES-specific (`cqrs-es`, `cqrs-es-nestjs`):
- Append-only event store with version-based optimistic concurrency
- Projection rebuild method

---

## Per-service gaps (apply to every project)

### 1. Observability **[P0]**
All 7 projects have zero logging, zero metrics, zero tracing, no health endpoints. This is the biggest gap.

- [ ] **Structured logging** — replace any `console.*` with `nestjs-pino` (pino + Nest integration). JSON logs only; no `console.log` in prod code.
- [ ] **Request ID / correlation ID** — `nestjs-pino` auto-binds a request ID to every log line via async context; propagate it on outbound calls via an `x-request-id` header.
- [ ] **`GET /health/live`** — cheap liveness (process alive). Responds 200 with no dependency checks.
- [ ] **`GET /health/ready`** — readiness: pings Postgres (`SELECT 1`). Returns 503 if dependencies down. Use `@nestjs/terminus`.
- [ ] **Metrics endpoint** — `@willsoto/nestjs-prometheus` exposes `/metrics`. At minimum: HTTP request duration histogram, request counter by route+status, DB pool gauges.
- [ ] **Tracing** *(P1)* — OpenTelemetry SDK with auto-instrumentation for http + pg + Nest. Export OTLP to whatever collector your platform supports.
- [ ] **Never log PII** — account numbers, balances, user identifiers. Add a pino redaction config for known sensitive fields.

### 2. Configuration & secrets **[P0]**
Every project reads `process.env.DATABASE_URL` with a hardcoded localhost fallback. That fallback is a foot-gun in production.

- [ ] **`@nestjs/config` with a Zod schema** — validate all env vars at boot; fail fast if anything is missing or malformed. Remove the localhost fallback.
- [ ] **Encrypted `.env` via `dotenvx`** — commit an encrypted `.env` per project (managed by `dotenvx`); the decryption key (`DOTENV_PRIVATE_KEY`) is injected by the platform. No `.env.example`.
- [ ] **Never commit real (unencrypted) secrets** — enforce with a pre-commit hook (see §10) or `gitleaks` in CI. `dotenvx` encrypts values at rest; the private key must never be committed.
- [ ] **Different configs per environment** — load from env vars, not from checked-in files. The platform injects them (Kubernetes Secret, Vault, AWS Secrets Manager, etc.). `dotenvx` supports per-env files (`.env.production`, `.env.staging`).

### 3. Input validation & API contract **[P0]**
Controllers accept inline object types with no runtime validation. A request with the wrong shape reaches domain code.

- [ ] **DTO schemas with `nestjs-zod`** — Zod-based DTOs; same choice across all 7 projects.
- [ ] **Enable `ValidationPipe` globally** with `whitelist: true, forbidNonWhitelisted: true, transform: true` in `main.ts`.
- [ ] **Validate at the edge only** — domain layer trusts inputs once they pass the pipe. Don't double-validate.
- [ ] **OpenAPI/Swagger** *(P1)* — `@nestjs/swagger` generates it from DTOs. Expose `/docs` in non-prod only.
- [ ] **API versioning** *(P1)* — Nest `VersioningType.URI` (`/v1/...`). Decide policy before first external consumer.

### 4. Security middleware **[P0]**
No `helmet`, no CORS policy, no rate limiting.

- [ ] **`helmet`** — standard HTTP hardening headers. Wire in `main.ts`.
- [ ] **CORS** — explicit allow-list of origins. Default-deny. Never `origin: '*'` with credentials.
- [ ] **Rate limiting** — `@nestjs/throttler`. Per-IP and per-authenticated-subject limits.
- [ ] **Body size limit** — set `bodyParser` JSON limit (e.g., 100kb) to prevent memory-pressure DoS.
- [ ] **Auth + authz** *(P0 for anything user-facing)* — currently absent entirely. Pick a strategy (JWT / session / OIDC) and add it. A banking API with no auth is not production.
- [ ] **`npm audit --production` in CI** — fail on high/critical. Run `npm audit` weekly (Dependabot / Renovate).

### 5. Error handling **[P1]**
Domain errors map to HTTP status well. A few process-level gaps remain.

- [ ] **`process.on('unhandledRejection')` and `'uncaughtException'`** — log and exit(1). Don't try to recover; let the orchestrator restart. Wire in `main.ts` before `bootstrap()`.
- [ ] **Standard error response shape** — all errors return `{ error: { code, message, requestId } }`. Never leak stack traces in production responses.
- [ ] **Distinguish 4xx from 5xx in logs** — 4xx = info/warn, 5xx = error. Don't page on 4xx.

### 6. Persistence **[P1]**
Good foundation. A few hardening items.

- [ ] **Pool sizing** — set `max`, `idleTimeoutMillis`, `connectionTimeoutMillis` explicitly on `pg.Pool`. Defaults aren't tuned for your workload.
- [ ] **Statement timeout** — set `statement_timeout` on connection (or per-query) to kill runaway queries before they exhaust the pool.
- [ ] **Migrations in CI, not at boot** — run `drizzle-kit migrate` as a deploy step. Don't migrate on container start (race between replicas).
- [ ] **Backups & PITR** — platform concern, but document retention and restore procedure.
- [ ] **Read-your-own-writes semantics** — in CQRS/ES, the query side is eventually consistent. Document this for API consumers or add read-after-write fallbacks where UX requires it.

### 7. Graceful shutdown **[P1]**
Currently no SIGTERM handling. Kubernetes will kill in-flight requests.

- [ ] **Enable Nest shutdown hooks** — `app.enableShutdownHooks()` in `main.ts`.
- [ ] **Drain HTTP** — stop accepting new connections on SIGTERM, finish in-flight requests within terminationGracePeriod.
- [ ] **Close the pg pool cleanly** — `OnModuleDestroy` on a connection provider calls `pool.end()`.
- [ ] **Kubernetes readiness flip** — readiness probe returns 503 as soon as SIGTERM received, so the service mesh stops routing before shutdown completes.

### 8. Build & deploy **[P0]**
No Dockerfile, no CI, no `.env.example` — nothing is deployable today.

- [ ] **Multi-stage Dockerfile** per project: `FROM node:22-alpine AS build` (pin version) → `npm ci --ignore-scripts` → `npm run build` → production stage with `node:22-alpine`, non-root user (`USER node`), only `node_modules` + `dist`.
- [ ] **`.dockerignore`** — at least `node_modules`, `.env*`, `coverage`, `.git`, test files.
- [ ] **Pin Node version** — add `"engines": { "node": ">=22 <23" }` to each package.json.
- [ ] **CI workflow** (`.github/workflows/ci.yml`) — on PR: `npm ci`, `npm run lint`, `npm run build`, `npm test`, `npm audit`. Matrix across all 7 projects or one workflow per project.
- [ ] **Don't run `npm start` in prod** — `node dist/main.js` with no dev deps. `npm run start:prod` is fine if it does that.

### 9. Testing **[P1]**
Tests exist and the split is good. A few things to harden.

- [ ] **Coverage reporting** — Vitest `--coverage` (v8 provider). Set thresholds and fail CI below them (e.g., 80% lines on domain layer).
- [ ] **Integration tests against a real Postgres in CI** — `services: postgres:` in the GitHub Actions job, or Testcontainers. Don't rely on a manually-started container.
- [ ] **Seed/teardown isolation** — each test starts from a known state. Either transaction-per-test with rollback, or truncate + reseed in `beforeEach`.
- [ ] **Don't mock what you own when cheap to integrate** — a real Postgres in tests catches schema drift and Drizzle/SQL bugs that mocks hide.

### 10. Code quality & developer workflow **[P1]**

- [ ] **Pre-commit hook** — `husky` + `lint-staged` runs `biome check --apply-unsafe` on staged files. Catches style/lint before CI.
- [ ] **Typecheck in CI** — `tsc --noEmit` as a separate job step; Biome doesn't type-check.
- [ ] **Conventional Commits + CHANGELOG** *(P2)* — only if you're cutting versioned releases.
- [ ] **Dependabot / Renovate** — automate dependency updates; group minor/patch together.

---

## CQRS/ES-specific gaps
Applies only to `cqrs-es` and `cqrs-es-nestjs`. Several production concerns that hand-rolled and `@nestjs/cqrs` variants both skip today.

- [ ] **Idempotency** *(P0)* — commands carry a client-supplied idempotency key; persist `(key, result_hash)` so retries are safe. Without this, a network retry doubles a deposit.
- [ ] **Outbox pattern** *(P1)* — integration events published to external systems should be written to an outbox table in the same transaction as the event append, then published by a separate worker. Otherwise you'll lose events on partial failures.
- [ ] **Snapshotting** *(P1, scales matter)* — rebuild from event N+snapshot, not event 0, once aggregates accumulate hundreds of events. Write snapshot every N events.
- [ ] **Projection catch-up monitoring** — track `current_position` per projection; alert on lag. A stalled projection silently returns stale reads.
- [ ] **Projection rebuild operationally** — document how to rebuild, expected downtime, whether it can run in a blue-green style. The method exists in code; the runbook doesn't.
- [ ] **Event schema versioning** — `event_type` + `event_version`. Have a policy for upcasting old events before they reach handlers.

---

## Repo-level (root) **[P1]**

- [ ] **Root `.github/workflows/ci.yml`** that discovers and runs CI for each project. Avoid 7 copies of the same workflow.
- [ ] **Root `Makefile` or task runner** (`just`, `turbo`, or a bash script) — `make test-all`, `make build-all` so contributors can verify the whole repo.
- [ ] **SECURITY.md** with a disclosure address.
- [ ] **LICENSE** file (if sharing externally — didn't see one).
- [ ] **Root `.editorconfig`** — enforces consistent indentation for contributors not running Biome locally.

---

## Suggested order if you actually ship this

1. Config schema + `.env.example` + remove the localhost fallback (§2). Blocks everything else being meaningful.
2. Dockerfile + CI (§8). Without these nothing leaves your laptop.
3. Input validation (§3) + security middleware (§4). Without these the service is unsafe.
4. Structured logging + health endpoints (§1, first three items). Without these you can't diagnose any production issue.
5. Graceful shutdown (§7). Without this, every deploy drops requests.
6. Unhandled rejection handlers + error shape (§5).
7. Auth/authz (§4). Biggest design decision; do it once, carefully.
8. Metrics + pool tuning + migration runner in CI (§1, §6).
9. CQRS/ES: idempotency, then outbox (§CQRS-specific).
10. Polish: tracing, snapshotting, OpenAPI, coverage thresholds.
