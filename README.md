# Architecture Patterns Comparison

Seven implementations of the same banking API, each using a different architecture pattern. Same domain, same tech stack, same tests -- only the architecture changes.

## What's Inside

| Folder | Architecture | Description |
|--------|-------------|-------------|
| [`n-tier/`](n-tier/) | N-Tier (Layered) | Traditional controller / service / repository layers. Top-down dependency flow. Simplest possible structure. |
| [`hexagonal/`](hexagonal/) | Hexagonal (Ports & Adapters) | Domain defines port interfaces; infrastructure implements adapters. Dependency inversion at the boundary. |
| [`onion/`](onion/) | Onion | Concentric layers with the domain model at the center. Pure domain services as functions with zero side effects. |
| [`clean/`](clean/) | Clean Architecture | One class per use case with explicit Input/Output DTOs. Entities with behavior, gateway interfaces, presenter layer. |
| [`ddd/`](ddd/) | DDD Tactical Patterns | Rich aggregates, value objects, domain events. Business invariants enforced by the domain model itself. |
| [`cqrs-es/`](cqrs-es/) | CQRS/Event Sourcing (hand-rolled) | Append-only event store, aggregate reconstitution from events, separate read/write models. No framework. |
| [`cqrs-es-nestjs/`](cqrs-es-nestjs/) | CQRS/Event Sourcing (@nestjs/cqrs) | Same CQRS/ES approach using the `@nestjs/cqrs` module for command/query buses and aggregate lifecycle. |

## The Domain

A banking API with two core operations: **managing accounts** and **transferring money**. Transfers must be atomic (no partial updates), and failed transfers (insufficient funds) are recorded rather than silently rejected. All seven projects expose the same REST endpoints and return the same response shapes.

See [PROBLEM.md](PROBLEM.md) for the full specification including endpoints, validation rules, and constraints.

## Tech Stack

All projects use the same stack:

- **NestJS** -- Application framework
- **TypeScript** -- Language
- **Drizzle ORM** -- Database queries and migrations
- **PostgreSQL** -- Database (via Docker)
- **Vitest** -- Test runner
- **Biome** -- Linting and formatting

## Quick Start

Each project is fully independent with its own `package.json`, `docker-compose.yml`, database, and migrations. Pick any project and run it in isolation.

### Prerequisites

- Node.js (v18+)
- Docker and Docker Compose

### Run a project

```bash
cd <project>            # e.g., cd n-tier
docker-compose up -d    # Start PostgreSQL
npm install             # Install dependencies
npm run db:migrate      # Run Drizzle migrations
npm test                # Run all tests
```

Some projects split unit and integration tests. Where available:

```bash
npm run test:unit           # Unit tests only (no DB required)
npm run test:integration    # Integration tests only (requires DB)
```

The `test:unit` and `test:integration` scripts are available in: `onion`, `clean`, `ddd`, `cqrs-es`, and `cqrs-es-nestjs`. The `n-tier` and `hexagonal` projects run all tests with `npm test`.

### Other useful commands

```bash
npm run start:dev    # Start the API with file watching
npm run lint         # Check linting with Biome
npm run lint:fix     # Auto-fix lint issues
```

## How to Explore

Suggested reading order:

1. **Read [PROBLEM.md](PROBLEM.md)** -- Understand the domain and API surface that all seven projects implement.
2. **Read [COMPARISON.md](COMPARISON.md)** -- See how the architectures differ across key concerns: where business rules live, how persistence is abstracted, how errors flow, and when to use what.
3. **Pick a project** -- Read its README, then explore the code. Each README covers architecture overview, project structure, key patterns, gotchas, and pros/cons.
4. **Follow the progression** -- Each architecture builds on ideas from the previous one:

```
n-tier  -->  hexagonal  -->  onion  -->  clean  -->  ddd  -->  cqrs-es  -->  cqrs-es-nestjs
```

The jump from n-tier to hexagonal introduces dependency inversion. Onion tightens layer discipline. Clean adds explicit use case classes. DDD introduces rich domain models. CQRS/ES replaces mutable state with an event store.

## Key Files

| File | Description |
|------|-------------|
| [PROBLEM.md](PROBLEM.md) | Full domain specification -- accounts, transfers, API endpoints, business rules |
| [COMPARISON.md](COMPARISON.md) | Side-by-side architecture comparison with decision matrix and progression path |
| [n-tier/README.md](n-tier/README.md) | N-Tier architecture guide |
| [hexagonal/README.md](hexagonal/README.md) | Hexagonal architecture guide |
| [onion/README.md](onion/README.md) | Onion architecture guide |
| [clean/README.md](clean/README.md) | Clean Architecture guide |
| [ddd/README.md](ddd/README.md) | DDD Tactical Patterns guide |
| [cqrs-es/README.md](cqrs-es/README.md) | CQRS/Event Sourcing (hand-rolled) guide |
| [cqrs-es-nestjs/README.md](cqrs-es-nestjs/README.md) | CQRS/Event Sourcing (@nestjs/cqrs) guide |
