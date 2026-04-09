# Problem Statement

## The Domain: A Simple Banking System

Build a banking API that supports two core operations: **managing accounts** and **transferring money between them**.

### Accounts

- An account has an **id** (UUID), an **owner** (non-empty string), a **balance** (non-negative number), and a **status** (`ACTIVE`).
- On creation, the owner name is validated (must not be blank) and the initial balance must be zero or positive.
- Accounts can be listed and retrieved by ID.

### Transfers

- A transfer moves money from a **source account** to a **destination account**.
- The transfer amount must be positive.
- Both accounts must exist.
- The source account must have sufficient funds. If it does not, the transfer is recorded as `FAILED` (balances unchanged) rather than silently rejected.
- A successful transfer atomically debits the source and credits the destination. No partial updates. If the process crashes mid-transfer, neither balance changes.
- Transfers can be retrieved by ID.

### The API

All 7 projects expose the same REST endpoints:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/accounts` | Create an account (`{ owner, balance }`) |
| `GET` | `/accounts` | List all accounts |
| `GET` | `/accounts/:id` | Get account by ID |
| `POST` | `/transfers` | Initiate a transfer (`{ fromAccountId, toAccountId, amount }`) |
| `GET` | `/transfers/:id` | Get transfer by ID |
| `GET` | `/accounts/:id/events` | Event stream (CQRS/ES projects only) |

Responses use the same JSON shapes across all projects. HTTP status codes follow the same conventions: 201 for creation, 400 for validation errors, 404 for not found, 409 for concurrency conflicts.

## The Constraint

Seven independent projects implement this exact domain with:

- **Same tech stack**: NestJS, TypeScript, Drizzle ORM, PostgreSQL, Vitest
- **Same API surface**: identical endpoints, request/response shapes, status codes
- **Same business rules**: identical validation, insufficient-funds handling, transfer atomicity
- **Different architecture**: each project organizes the code using a different architectural pattern

The seven architectures:

1. **N-Tier** -- Traditional layered (controller / service / repository)
2. **Hexagonal** -- Ports and adapters, dependency inversion at the boundary
3. **Onion** -- Concentric layers with domain at the center, interfaces owned by the domain
4. **Clean Architecture** -- Entities, use cases, interface adapters, infrastructure. One class per use case with explicit input/output DTOs
5. **DDD Tactical Patterns** -- Rich aggregates, value objects, domain events, repository interfaces
6. **CQRS/Event Sourcing (hand-rolled)** -- Append-only event store, aggregate reconstitution from events, separate read/write models, no framework
7. **CQRS/Event Sourcing (@nestjs/cqrs)** -- Same CQRS/ES approach but using the `@nestjs/cqrs` module for command/query buses and aggregate lifecycle

## The Purpose

This is a **learning exercise**. The goal is to answer:

- How does each architecture organize the same business problem?
- What does each pattern add in terms of structure, testability, and flexibility?
- What does each pattern cost in terms of boilerplate, indirection, and cognitive load?
- When is the added structure worth it, and when is it overhead?

By holding the domain, API, and tech stack constant, the only variable is the architecture itself. You can compare file counts, trace the same request through each codebase, and see exactly where the trade-offs land.

This is not a showcase of "the right way." It is a reference for understanding what each architecture actually looks like in practice, with real code, real tests, and real gotchas.
