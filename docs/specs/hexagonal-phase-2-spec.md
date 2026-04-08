# Spec: Hexagonal Architecture (Ports & Adapters) -- Banking/Money Transfer (Phase 2)

## Overview

Rebuild the same banking domain from Phase 1 (N-tier) using Hexagonal Architecture. The domain core (entities, business rules, port interfaces) has zero knowledge of NestJS, Drizzle, or any infrastructure. Driving adapters (REST controller) push requests into the domain through application ports. Driven adapters (Drizzle repository) implement ports the domain declares but never sees. The functional behavior is identical to Phase 1 -- same five endpoints, same business rules -- but the dependency arrows are reversed.

**Learning goal**: Experience the moment where you can test the entire domain by plugging in an in-memory adapter, and nothing in the domain changes.

## Slice 1: Project Skeleton + Domain Core + Account Creation (end-to-end)

The walking skeleton: a running NestJS app where a driving adapter (controller) calls an application service through a port, the application service creates an account using domain logic, and a driven adapter (Drizzle repository) persists it -- all wired together and provably working.

### Acceptance Criteria

- [x] Running `npm install` and `docker-compose up` in the `hexagonal/` directory starts a working PostgreSQL database
- [x] Running `npm test` executes the Vitest test suite
- [x] The domain core directory contains no imports from `@nestjs/*`, `drizzle-orm`, or any infrastructure library
- [x] Account entity and its business rules live in the domain core
- [x] A repository port (interface) for accounts is declared in the domain core, not in the infrastructure layer
- [x] A Drizzle-backed adapter implements the account repository port
- [x] A user can create an account by sending POST /accounts with an owner name and initial balance
- [x] The created account is returned with an id (UUID), owner, balance, and status of ACTIVE
- [x] Creating an account with a negative initial balance is rejected with an error
- [x] Creating an account without an owner name is rejected with an error
- [x] The account is persisted -- creating it and then retrieving it returns the same data
- [x] Domain business rules (validation) can be tested with an in-memory adapter -- no database required

### Hexagonal Architecture Notes (for implementer)

- **Domain core**: `src/domain/` -- entities, port interfaces, domain errors. Zero framework imports.
- **Application**: `src/application/` -- application services that orchestrate domain logic through ports.
- **Adapters**: `src/adapters/driving/` (REST controller) and `src/adapters/driven/` (Drizzle repository).
- The controller (driving adapter) depends on the application service. The application service depends on port interfaces. The Drizzle adapter implements the port interface. The domain never looks outward.

## Slice 2: Account Retrieval Endpoints

Read endpoints for accounts. The full account lifecycle (create + read) is complete after this slice.

### Acceptance Criteria

- [x] A user can retrieve an account by its id via GET /accounts/:id
- [x] The response includes the account's id, owner, balance, and status
- [x] Requesting a non-existent account id returns a not-found error
- [x] Requesting an account with an invalid id format returns an error
- [x] A user can list all accounts via GET /accounts
- [x] When no accounts exist, the list endpoint returns an empty collection
- [x] When multiple accounts exist, all are returned in the list
- [x] Error mapping happens in the adapter layer -- domain errors are translated to HTTP status codes by the driving adapter, not by the domain itself

## Slice 3: Money Transfer with Business Rules

The showcase slice for hexagonal architecture. The domain service orchestrates the transfer using only port interfaces. The insufficient funds rule lives in the domain. Transaction management is the adapter's responsibility, not the domain's.

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
- [x] The domain service that orchestrates the transfer does not import any infrastructure module (no Drizzle, no NestJS)
- [x] The transfer domain logic can be tested with in-memory adapters -- no database, no HTTP, no framework

### Hexagonal Architecture Notes (for implementer)

- The domain service calls port methods like `findById`, `updateBalance`, `insertTransfer`. It does not call `db.transaction()`.
- Transaction atomicity is the driven adapter's concern. The adapter can wrap the port calls in a database transaction. One approach: a "unit of work" port that the adapter implements with a real transaction. The domain asks for atomicity; the adapter decides how.
- This is the key contrast with N-tier: in Phase 1, the service imported `DrizzleDB` directly and called `db.transaction()`. Here, the domain has no idea transactions exist.

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

## API Shape (indicative -- identical to Phase 1)

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
- **Architecture**: Hexagonal (Ports & Adapters) -- domain core with zero infrastructure imports, driving adapters (REST), driven adapters (Drizzle)
- **Project location**: `hexagonal/` directory, fully independent with own package.json and docker-compose.yml
- **Testing philosophy**: Behavioral tests. Domain logic tested with in-memory adapters (the hexagonal payoff). Integration tests use full HTTP round-trips against a real database. No mocking implementation details.
- **Risk level**: LOW
- **Patterns to follow**: NestJS modules for wiring adapters to ports via dependency injection. Drizzle for schema and queries (in adapters only). Vitest for all tests.

## Key Contrast with N-tier (Phase 1)

| Concern | N-tier (Phase 1) | Hexagonal (Phase 2) |
|---|---|---|
| Business rules location | Service layer (imports NestJS exceptions) | Domain core (no framework imports) |
| Repository dependency | Service imports concrete repository class | Application service depends on a port interface; adapter implements it |
| Transaction management | Service calls `db.transaction()` directly | Adapter handles transactions; domain requests atomicity through a port |
| Error types | NestJS `BadRequestException`, `NotFoundException` | Domain-specific errors; adapter maps them to HTTP status codes |
| Testability | Unit tests need to work around framework coupling | Domain tests use in-memory adapters -- no database, no framework |
| Dependency direction | Controller -> Service -> Repository (all point down) | Adapters -> Application -> Domain (all point inward); adapters implement domain ports |

[x] Reviewed
