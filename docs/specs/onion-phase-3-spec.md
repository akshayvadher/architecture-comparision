# Spec: Onion Architecture -- Banking/Money Transfer (Phase 3)

## Overview

Rebuild the same banking domain from Phase 1 (N-tier) and Phase 2 (Hexagonal) using Onion Architecture. The code behavior is identical -- same five endpoints, same business rules, same API shape. What changes is the explicit layering: concentric rings where dependencies always point inward, and the separation between domain services (pure business logic) and application services (orchestration) becomes a first-class structural concern rather than an implicit convention.

**Learning goal**: Experience the moment where the concentric layers make dependency direction a visible, enforceable rule -- not just a guideline. Understand why domain services and application services are different things, and feel the architectural pressure when you try to let an inner layer reference an outer one.

## Slice 1: Project Setup + Domain Model + Domain Services + Account Creation (end-to-end)

The walking skeleton: a running NestJS app with explicit onion layers. The domain model (innermost ring) defines the Account entity with zero dependencies. A domain service contains pure business validation. An application service orchestrates the creation use case. The infrastructure layer (outermost ring) provides the REST controller and Drizzle persistence. All wired together, provably working end-to-end.

### Acceptance Criteria

- [x] Running `npm install` and `docker-compose up` in the `onion/` directory starts a working PostgreSQL database
- [x] Running `npm test` executes the Vitest test suite
- [x] The project has four explicit layer directories: domain model, domain services, application services, and infrastructure
- [x] The domain model layer contains entities and value objects with zero imports from any other layer or external library
- [x] The domain services layer imports only from the domain model layer -- never from application services or infrastructure
- [x] The application services layer imports from domain model and domain services -- never from infrastructure
- [x] The infrastructure layer (controllers, repositories, framework wiring) may import from any inner layer but no inner layer imports from it
- [x] Repository interfaces are declared in the domain services or application services layer -- not in infrastructure
- [x] A user can create an account by sending POST /accounts with an owner name and initial balance
- [x] The created account is returned with an id (UUID), owner, balance, and status of ACTIVE
- [x] Creating an account with a negative initial balance is rejected with an error
- [x] Creating an account without an owner name is rejected with an error
- [x] The account is persisted -- creating it and then retrieving it returns the same data
- [x] Domain model validation logic can be tested in complete isolation -- no services, no adapters, no database

### Onion Architecture Notes (for implementer)

- **Domain Model** (`src/domain/model/`): Account entity, Transfer entity, domain errors, value types. This is the innermost ring. It depends on nothing.
- **Domain Services** (`src/domain/services/`): Pure business logic that operates on domain model types. Example: account validation rules. Depends only on domain model.
- **Application Services** (`src/application/`): Orchestration of use cases. Calls domain services, coordinates persistence through repository interfaces. Depends on domain model + domain services.
- **Infrastructure** (`src/infrastructure/`): NestJS controllers, Drizzle repositories, framework modules. The outermost ring. Implements interfaces declared by inner layers.

The key structural difference from Hexagonal: in Phase 2, `src/domain/` was a single layer containing entities, ports, and errors. Here, the domain is split into two distinct rings -- model and services -- with an enforced dependency direction between them.

## Slice 2: Account Retrieval Endpoints

Read endpoints for accounts. After this slice, the full account lifecycle (create + read) is complete.

### Acceptance Criteria

- [x] A user can retrieve an account by its id via GET /accounts/:id
- [x] The response includes the account's id, owner, balance, and status
- [x] Requesting a non-existent account id returns a not-found error
- [x] Requesting an account with an invalid id format returns an error
- [x] A user can list all accounts via GET /accounts
- [x] When no accounts exist, the list endpoint returns an empty collection
- [x] When multiple accounts exist, all are returned in the list
- [x] Domain errors are translated to HTTP responses in the infrastructure layer -- inner layers do not reference HTTP concepts

## Slice 3: Money Transfer with Business Rules

The showcase slice for Onion Architecture. This is where the separation between domain services and application services becomes concrete and consequential. The domain service owns the insufficient funds rule (pure business logic). The application service orchestrates the transfer workflow (find accounts, invoke domain service, persist changes). Transaction management belongs to the infrastructure layer.

### Acceptance Criteria

- [x] A user can initiate a transfer by sending POST /transfers with a source account, destination account, and amount
- [x] A successful transfer debits the source account and credits the destination account by the exact transfer amount
- [x] The transfer is returned with an id, source/destination account references, amount, timestamp, and a status of COMPLETED
- [x] Transferring more money than the source account's balance is rejected with an insufficient-funds error
- [x] When a transfer is rejected for insufficient funds, neither account's balance changes
- [x] The transfer record for a rejected transfer has a status of FAILED
- [x] Transferring zero or a negative amount is rejected with an error
- [x] Transferring from a non-existent account returns a not-found error
- [x] Transferring to a non-existent account returns a not-found error
- [x] A transfer is atomic -- if any part of the operation fails mid-way, no account balances are changed
- [x] The insufficient funds check lives in a domain service, not in the application service -- it is pure business logic with no orchestration concerns
- [x] The application service orchestrates the transfer workflow (load accounts, call domain service, persist results) but does not contain the business rule itself
- [x] Transaction management (database transaction wrapping) lives in the infrastructure layer -- neither domain services nor application services reference database transactions
- [x] The domain service can be tested with plain objects -- no mocks, no adapters, no database, no framework

### Onion Architecture Notes (for implementer)

This slice makes the three-way separation concrete:

| Responsibility | Layer | What it does in the transfer |
|---|---|---|
| Insufficient funds rule | Domain Service | Takes account + amount, returns success or domain error. Pure function-like logic. |
| Transfer orchestration | Application Service | Loads accounts via repository interface, calls domain service, persists results via repository interface. Coordinates the workflow. |
| Transaction atomicity | Infrastructure | The repository adapter wraps the persist operations in a database transaction. The application service requests atomicity through an interface; infrastructure decides how. |

**Contrast with Hexagonal (Phase 2)**: In Hexagonal, the "application service" did both orchestration and some business logic -- the boundary was implicit. Here, the domain service is a separate, testable layer that the application service calls into. The business rule is structurally isolated, not just conventionally separated.

**Contrast with N-tier (Phase 1)**: In N-tier, one service method contained the business rule, the orchestration, and the `db.transaction()` call. Here, those three concerns live in three different layers.

## Slice 4: Transfer Retrieval

Read endpoint for transfers. Completes the full API surface. All five endpoints operational.

### Acceptance Criteria

- [x] A user can retrieve a transfer by its id via GET /transfers/:id
- [x] The response includes the transfer's id, source account, destination account, amount, timestamp, and status
- [x] Requesting a non-existent transfer id returns a not-found error
- [x] Requesting a transfer with an invalid id format returns an error

## Out of Scope

- No authentication or authorization
- No pagination, filtering, or sorting on list endpoints
- No account closure or status transitions beyond initial ACTIVE
- No transfer history per account
- No currency handling -- all amounts are plain numbers
- No rate limiting or request validation beyond basic field presence/type
- No CI/CD pipeline
- No shared test infrastructure with other architecture phases
- No event-driven patterns (that is Phase 5+)
- No DDD tactical patterns like aggregates or value objects with behavior (that is Phase 5)

## API Shape (indicative -- identical to Phase 1 and Phase 2)

```
POST   /accounts           { owner: string, balance: number }           -> Account
GET    /accounts/:id                                                     -> Account
GET    /accounts                                                         -> Account[]
POST   /transfers          { fromAccountId: UUID, toAccountId: UUID, amount: number } -> Transfer
GET    /transfers/:id                                                    -> Transfer
```

Account shape: `{ id: UUID, owner: string, balance: number, status: "ACTIVE" }`

Transfer shape: `{ id: UUID, fromAccountId: UUID, toAccountId: UUID, amount: number, timestamp: datetime, status: "COMPLETED" | "FAILED" }`

## Technical Context

- **Stack**: NestJS, TypeScript, Drizzle ORM, PostgreSQL, Vitest
- **Architecture**: Onion -- four concentric layers (domain model -> domain services -> application services -> infrastructure) with strict inward-only dependency direction
- **Project location**: `onion/` directory, fully independent with own package.json and docker-compose.yml
- **Testing philosophy**: Behavioral tests. Domain model tested in pure isolation (no dependencies at all). Domain services tested with plain objects (no adapters, no mocks). Application services tested with in-memory repository implementations. Integration tests use full HTTP round-trips against a real database. No mocking implementation details.
- **Risk level**: LOW
- **Patterns to follow**: NestJS modules for dependency injection wiring in the infrastructure layer. Drizzle for schema and queries (infrastructure only). Vitest for all tests.

## Key Contrast: N-tier vs Hexagonal vs Onion

| Concern | N-tier (Phase 1) | Hexagonal (Phase 2) | Onion (Phase 3) |
|---|---|---|---|
| Layer structure | Controller -> Service -> Repository (linear chain) | Domain core + driving/driven adapters (inside/outside) | Four concentric rings with strict inward dependency (model -> domain services -> app services -> infrastructure) |
| Business rules location | Service layer (imports NestJS exceptions) | Domain core (no framework imports) | Domain services layer (depends only on domain model, structurally separated from orchestration) |
| Orchestration location | Same service that has business rules | Application service (somewhat blurred with domain) | Application services layer (explicitly separate from domain services) |
| Repository dependency | Service imports concrete repository class | Application service depends on port interface | Application service depends on interface declared in an inner layer; infrastructure implements it |
| Transaction management | Service calls `db.transaction()` directly | Adapter handles transactions through a port | Infrastructure layer handles transactions; application service requests atomicity through an interface |
| Error types | NestJS exceptions (`BadRequestException`) | Domain-specific errors; adapter maps to HTTP | Domain-specific errors in domain model; infrastructure maps to HTTP |
| Testability of business rules | Needs service + mocked repository at minimum | Domain tested with in-memory adapters | Domain model tested with zero dependencies; domain services tested with plain objects |
| Dependency direction enforcement | None -- convention only | Implicit via ports/adapters pattern | Explicit via concentric layers -- each ring can only see rings inside it |
| What separates this from the previous | Baseline -- no separation | Introduces dependency inversion and ports | Makes layering explicit; splits "domain" into model + services with a clear boundary between them |

## Aha-Moment Checkpoint

After completing this phase, try these experiments:

1. **Try to import from infrastructure into a domain service.** The directory structure should make this feel architecturally wrong -- you are reaching from an inner ring to an outer ring. In Hexagonal, this was a convention. In Onion, it is a structural violation.
2. **Compare the transfer domain service to the hexagonal version.** Notice that the Onion domain service is purer -- it takes domain objects in and returns domain results out. It does not coordinate a workflow or call repository methods. That orchestration is the application service's job.
3. **Look at the application service.** It reads like a workflow script: load data, call domain service, persist results. It has no business rules in it. In N-tier, the service had everything. In Hexagonal, the application service still had some business logic mixed with orchestration. Here, the separation is complete.

[x] Reviewed
