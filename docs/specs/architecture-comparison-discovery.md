# Discovery: Architecture Patterns Comparison -- Banking/Money Transfer

## Why

Learning software architecture from books and articles only gets you so far. The real understanding comes from building the same thing six different ways and feeling where each pattern helps, where it hurts, and where the "aha" moments land.

This project exists to deeply learn six architecture patterns -- not by reading about them, but by implementing the same banking domain in each one. Same entities, same business rules, same API surface. The only thing that changes is how the code is organized and how responsibilities flow. That contrast is the teacher.

## Who

- **Primary user**: The developer building this (you). This is a personal learning exercise.
- **Secondary audience**: Anyone who later reads the code to compare patterns side by side.

## Success Criteria

- Each of the six projects implements the same domain and passes the same behavioral tests, proving the architecture is a structural choice -- not a functional one.
- After completing each project, you can articulate what that pattern gives you and what it costs compared to the previous one.
- The progression from N-tier to CQRS/Event Sourcing builds understanding incrementally -- each new pattern introduces exactly one major concept on top of what came before.
- Tests in every project verify behavior, not implementation. Refactoring internals never breaks a test.

## Problem Statement

Architecture patterns are easy to diagram and hard to internalize. Most comparisons are theoretical -- they show folder structures and dependency arrows but never make you feel the trade-offs. By building the same bounded context (accounts and money transfers) six times with increasing architectural sophistication, you create a lived reference that no diagram can replace.

## Hypotheses

- **H1**: Building the same domain six ways will reveal that simpler architectures (N-tier) are faster to stand up but harder to change, while more structured ones (Hexagonal, Clean) cost more upfront but isolate change better.
- **H2**: The jump from N-tier to Hexagonal will be the single biggest conceptual leap -- introducing the idea that your domain does not depend on your framework.
- **H3**: DDD tactical patterns (aggregates, value objects, domain events) will make the transfer atomicity rule more explicit and easier to reason about than in any prior architecture.
- **H4**: CQRS/Event Sourcing will force a fundamentally different mental model -- events as the source of truth rather than current state -- and that shift will be the hardest to internalize.

---

## Domain Model

### Entities

**Account**
| Field   | Type   | Notes                              |
|---------|--------|------------------------------------|
| id      | UUID   | Primary key                        |
| owner   | string | Account holder name                |
| balance | number | Current balance (non-negative)     |
| status  | enum   | e.g., ACTIVE, CLOSED               |

**Transfer**
| Field       | Type      | Notes                                  |
|-------------|-----------|----------------------------------------|
| id          | UUID      | Primary key                            |
| fromAccount | UUID      | FK to Account                          |
| toAccount   | UUID      | FK to Account                          |
| amount      | number    | Positive value                         |
| timestamp   | datetime  | When the transfer was initiated        |
| status      | enum      | e.g., PENDING, COMPLETED, FAILED       |

### Business Rules

1. **Insufficient funds check** -- A transfer must be rejected if the source account's balance is less than the transfer amount. No overdrafts.
2. **Transfer atomicity** -- Both the debit from the source account and the credit to the destination account must succeed together, or neither happens. A partial transfer (money leaves one account but never arrives at the other) is the one thing that must never occur.

---

## Common API Surface

All six projects expose these endpoints (or their equivalent). The exact paths may vary slightly per architecture -- for example, CQRS may split queries onto separate endpoints -- but the operations are the same.

| #  | Method | Endpoint               | Description                          |
|----|--------|------------------------|--------------------------------------|
| 1  | POST   | /accounts              | Create a new account                 |
| 2  | GET    | /accounts/:id          | Get account details (incl. balance)  |
| 3  | GET    | /accounts              | List all accounts                    |
| 4  | POST   | /transfers             | Initiate a money transfer            |
| 5  | GET    | /transfers/:id         | Get transfer details and status      |

**Natural variation allowed**: CQRS/Event Sourcing may add endpoints like `GET /accounts/:id/events` to expose the event stream, or use separate command/query paths. That is expected and part of what makes the pattern distinct.

---

## Per-Architecture Summary

### 1. N-tier (Controller -> Service -> Repository)

**What makes it different**: The simplest possible layering. Each layer calls the one below it. No abstraction boundaries, no dependency inversion. The service layer contains all business logic and directly depends on the repository (concrete implementation).

**How it maps the domain**: Account and Transfer are database-backed models. Business rules live in the service layer as procedural checks before database writes. Transfer atomicity is handled by wrapping the service method in a database transaction.

**Learning focus**: Establish the baseline. Understand what "simple" gives you (speed, low ceremony) and what it costs (everything depends on everything).

### 2. Hexagonal (Ports and Adapters)

**What makes it different**: Introduces the concept of ports (interfaces the domain exposes or depends on) and adapters (implementations that plug into those ports). The domain no longer knows about the database, the HTTP framework, or any infrastructure.

**How it maps the domain**: Account and Transfer live in the domain core. Repository interfaces are "driven" ports. The REST controller is a "driving" adapter. Business rules are in domain services that only talk through ports.

**Learning focus**: The first time the domain is truly independent. The aha-moment is realizing you could swap Drizzle for an in-memory store and the domain would not know.

### 3. Onion Architecture

**What makes it different**: Takes the Hexagonal idea and makes the layering explicit -- concentric rings where dependencies always point inward. Domain is at the center, application services wrap it, infrastructure is the outermost ring.

**How it maps the domain**: Similar to Hexagonal in structure, but the layers are more formally defined. The distinction between domain services (pure business logic) and application services (orchestration, transaction management) becomes clear.

**Learning focus**: Understanding dependency direction as a first-class architectural rule. Everything depends inward, nothing in the center knows about the outside.

### 4. Clean Architecture (Uncle Bob)

**What makes it different**: Adds an explicit use-case layer. Each operation (CreateAccount, InitiateTransfer) becomes its own use case with a clear input/output boundary. The "interactor" pattern gives every operation a named, testable unit.

**How it maps the domain**: Entities are at the center. Use cases orchestrate entity behavior. Controllers map HTTP requests to use-case input, and presenters map use-case output to HTTP responses. Every boundary has a defined data transfer shape.

**Learning focus**: The use-case as the unit of behavior. Each operation is independently testable without HTTP or database. The boundary between "what the app does" and "how it talks to the outside world" becomes razor-sharp.

### 5. DDD (Domain-Driven Design) -- Tactical Patterns

**What makes it different**: Introduces aggregates (Account as an aggregate root that protects its own invariants), value objects (Money, AccountId), and domain events (TransferCompleted, TransferFailed). The domain model becomes richer and more expressive.

**How it maps the domain**: Account is an aggregate that enforces the insufficient-funds rule internally -- you cannot debit it below zero because the aggregate refuses. Transfer orchestration may publish domain events. Value objects make concepts like "money" explicit rather than a raw number.

**Learning focus**: The domain model does the talking. Business rules are not checks in a service -- they are behaviors on the aggregates themselves. Domain events make side effects explicit and traceable.

### 6. CQRS / Event Sourcing

**What makes it different**: Separates the write model (commands that produce events) from the read model (projections built from those events). The source of truth is no longer the current state in a row -- it is the sequence of events that produced that state.

**How it maps the domain**: A transfer command produces events (AccountDebited, AccountCredited). The current balance is a projection -- a read model rebuilt from the event stream. You can always answer "what happened?" not just "what is the current state?"

**Learning focus**: The hardest mental model shift. State is derived, not stored. Events are append-only facts. Understanding why this makes audit trails trivial but simple queries harder is the core insight.

---

## Testing Philosophy

Tests exist to give trust. They verify that the system behaves correctly, not that it is wired together in a particular way.

### Behavioral Unit Tests
- A "unit" is a group of collaborating objects that form a meaningful behavior -- not a single class in isolation.
- Test the behavior: "when I transfer $100 from an account with $50, the transfer is rejected and both balances are unchanged."
- Do not test implementation: no asserting that a specific method was called on a specific mock.

### Integration Tests
- Full HTTP round-trip: send a request, let it flow through business logic and hit the database, verify the response.
- These prove the whole stack works together for each endpoint.

### Shared Principle
- Tests must survive refactoring. If you restructure internals without changing behavior, no test should break.
- Each project has its own independent test suite -- no shared test infrastructure across projects.

---

## Phase / Milestone Map

Each phase is one architecture. They are ordered from simplest to most complex so that each new pattern builds on the understanding gained from the previous one.

### Phase 1: N-tier
- Stand up the simplest possible working implementation.
- All five endpoints operational. Both business rules enforced.
- Full test suite (behavioral unit + integration).
- **Aha-moment checkpoint**: Notice how the service layer does everything -- validation, orchestration, transaction management. It is convenient now, but imagine it at 10x the complexity.

### Phase 2: Hexagonal
- Rebuild the same domain with ports and adapters.
- Domain core has zero imports from NestJS or Drizzle.
- **Aha-moment checkpoint**: Swap the real repository for an in-memory one in tests. Notice how the domain does not change at all.

### Phase 3: Onion
- Rebuild with explicit concentric layers and strict dependency direction.
- Distinguish domain services from application services.
- **Aha-moment checkpoint**: Try to import something from an outer layer into the domain. Notice how the architecture makes this feel wrong.

### Phase 4: Clean Architecture
- Rebuild with explicit use cases as the unit of application behavior.
- Each use case has a defined input DTO and output DTO.
- **Aha-moment checkpoint**: Look at a use case in isolation. It reads like a specification of what the operation does, with no mention of HTTP or SQL.

### Phase 5: DDD
- Rebuild with aggregates, value objects, and domain events.
- Account enforces its own invariants. Transfer publishes events.
- **Aha-moment checkpoint**: The insufficient-funds rule is no longer an "if" statement in a service. It is a behavior on the Account aggregate that refuses to violate its own invariant.

### Phase 6: CQRS / Event Sourcing
- Rebuild with separate command and query models.
- Event store as source of truth. Read models as projections.
- **Aha-moment checkpoint**: Query the event stream to see the full history of an account. Realize that "current balance" is just one of many possible projections of the same events.

---

## Project Structure

```
comparision/
  n-tier/                  # Phase 1
    package.json
    docker-compose.yml
    src/
    test/
  hexagonal/               # Phase 2
    package.json
    docker-compose.yml
    src/
    test/
  onion/                   # Phase 3
    ...
  clean/                   # Phase 4
    ...
  ddd/                     # Phase 5
    ...
  cqrs-es/                 # Phase 6
    ...
  docs/
    specs/
      architecture-comparison-discovery.md   # This document
```

Each project is fully independent. No shared code, no monorepo linking. You should be able to `cd` into any project, run `docker-compose up`, `npm install`, and `npm test` without touching anything else.

---

## Open Questions

- **How far to take DDD domain events?** Should they trigger side effects (e.g., notifications) or just be recorded? For a learning exercise, recording and exposing them may be enough.
- **Event Sourcing storage**: Use a dedicated event store table in Postgres, or explore a purpose-built tool? Postgres is simpler and keeps the stack consistent across all six projects.
- **Error handling patterns**: Should all six projects share the same HTTP error response shape for easier comparison, or let each architecture handle errors in its natural way?

---

## Revised Assessment

- **Size**: EPIC (six independent projects, each a small feature in scope, but the collection is substantial)
- **Greenfield**: Yes -- all six projects built from scratch
- **Risk**: Low -- personal learning exercise with no external dependencies or stakeholders

[x] Reviewed
