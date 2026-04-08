# Spec: DDD -- Tactical Patterns -- Banking/Money Transfer (Phase 5)

## Overview

Rebuild the same banking domain from Phases 1-4 using Domain-Driven Design tactical patterns. The behavior is identical -- same five endpoints, same business rules, same API shape. What changes is the expressiveness of the domain model: Account becomes an aggregate root that protects its own invariants (you cannot debit it below zero because the aggregate refuses), Money and AccountId become value objects with explicit validation and equality semantics, and transfer orchestration publishes domain events (TransferCompleted, TransferFailed) that make side effects explicit and traceable.

**Learning goal**: Experience the moment where the insufficient-funds rule is no longer an "if" statement in a service or a check on a thin entity. It is a behavior on the Account aggregate that refuses to violate its own invariant. The domain model does the talking -- business rules are aggregate behaviors, not service-layer checks.

## Slice 1: Project Setup + Account Aggregate with Value Objects + Account Creation (end-to-end)

The walking skeleton: a running NestJS app with DDD tactical patterns. The domain layer defines the Account aggregate root with value objects (Money for balance and amounts, AccountId for identity). The aggregate enforces its own invariants -- it refuses to be created with a negative balance. The application layer orchestrates the creation use case. The infrastructure layer provides REST controllers and Drizzle persistence. Repositories work with whole aggregates, not raw data.

### Acceptance Criteria

- [x] Running `npm install` and `docker-compose up` in the `ddd/` directory starts a working PostgreSQL database
- [x] Running `npm test` executes the Vitest test suite
- [x] The project has distinct layer directories: domain (aggregates, value objects, events), application (services/use cases), and infrastructure (controllers, repositories, framework wiring)
- [x] The domain layer contains aggregates and value objects with zero imports from any other layer or external library
- [x] AccountId is a value object -- it wraps a UUID, validates format on creation, and supports equality comparison by value (two AccountIds with the same UUID are equal)
- [x] Money is a value object -- it wraps a numeric amount, rejects negative values on creation, and supports add and subtract operations that return new Money instances (immutable)
- [x] Account is an aggregate root that uses Money for its balance and AccountId for its identity -- not raw numbers and strings
- [x] The Account aggregate enforces its own creation invariants -- it refuses to be created with a negative balance or without an owner name
- [x] A user can create an account by sending POST /accounts with an owner name and initial balance
- [x] The created account is returned with an id (UUID), owner, balance, and status of ACTIVE
- [x] Creating an account with a negative initial balance is rejected with an error
- [x] Creating an account without an owner name is rejected with an error
- [x] The account is persisted -- creating it and then retrieving it returns the same data
- [x] The repository saves and loads whole Account aggregates -- it reconstitutes the aggregate (including value objects) from persistence, not just raw field data
- [x] Value objects can be tested in complete isolation -- no aggregate, no service, no database

### DDD Notes (for implementer)

- **Domain Layer** (`src/domain/`):
  - `aggregates/`: Account aggregate root, Transfer aggregate. Each aggregate protects its own invariants and all state changes go through the aggregate's public methods.
  - `value-objects/`: AccountId, Money, TransferId. Immutable, validated on creation, compared by value (not reference). Money.subtract() returns a new Money or throws if the result would be negative.
  - `events/`: Domain event types (TransferCompleted, TransferFailed). Defined here, published by aggregates or application services.
  - `errors/`: Domain-specific error types.
- **Application Layer** (`src/application/`): Services or use cases that orchestrate aggregate behavior. Load aggregates from repositories, invoke aggregate methods, persist changes, collect and dispatch domain events.
- **Infrastructure Layer** (`src/infrastructure/`): NestJS controllers, Drizzle repository implementations, framework modules. Repositories map between aggregates (with value objects) and database rows.

**Key structural difference from Clean Architecture (Phase 4)**: In Clean, entities had methods like `Account.debit()` but they were still relatively thin -- the entity was a data holder with some validation. In DDD, the Account is a full aggregate root: it encapsulates all its invariants, its state is expressed through value objects (Money, AccountId), and no external code can reach into its internals. The aggregate IS the business rules.

**Key structural difference regarding value objects**: In all prior phases, an account's balance was a plain `number` and its id was a plain `string`. In DDD, these become Money and AccountId -- types that carry their own validation, are immutable, and define equality semantics. You cannot accidentally pass a negative amount where Money is expected, because Money refuses to exist with a negative value.

## Slice 2: Account Retrieval Endpoints

Read operations for accounts. Repositories reconstitute full aggregates from persistence, and the application layer maps aggregate state to response data. After this slice, the full account lifecycle (create + read) is complete.

### Acceptance Criteria

- [x] A user can retrieve an account by its id via GET /accounts/:id
- [x] The response includes the account's id, owner, balance, and status
- [x] Requesting a non-existent account id returns a not-found error
- [x] Requesting an account with an invalid id format returns an error
- [x] A user can list all accounts via GET /accounts
- [x] When no accounts exist, the list endpoint returns an empty collection
- [x] When multiple accounts exist, all are returned in the list
- [x] The repository reconstitutes Account aggregates with their value objects intact when loading from the database
- [x] Domain errors are translated to HTTP responses in the infrastructure layer -- the domain layer does not reference HTTP concepts

### DDD Notes (for implementer)

The repository is the boundary between the domain and persistence. When loading an Account, the repository must reconstitute the full aggregate -- creating AccountId and Money value objects from the raw database columns. The aggregate that comes back from the repository is indistinguishable from one that was just created in memory.

**Contrast with Clean Architecture (Phase 4)**: In Clean, repository gateway interfaces returned entity objects with plain typed fields. Here, the repository returns fully reconstituted aggregates with value objects. The mapping from database rows to value objects happens inside the repository implementation (infrastructure layer).

## Slice 3: Money Transfer with Aggregates, Domain Events, and Business Rules

The showcase slice for DDD tactical patterns. This is where every DDD concept comes together: the Account aggregate enforces the insufficient-funds rule as its own behavior (not a service check), value objects ensure amounts are valid, and the transfer operation publishes domain events (TransferCompleted or TransferFailed) that make what happened explicit and traceable.

### Acceptance Criteria

- [x] A user can initiate a transfer by sending POST /transfers with a source account, destination account, and amount
- [x] A successful transfer debits the source account and credits the destination account by the exact transfer amount
- [x] The transfer is returned with an id, source/destination account references, amount, timestamp, and a status of COMPLETED
- [x] The Account aggregate's debit method rejects the operation when the balance is less than the transfer amount -- the insufficient-funds rule is enforced by the aggregate, not by an external service or use case
- [x] When a transfer is rejected for insufficient funds, neither account's balance changes
- [x] The transfer record for a rejected transfer has a status of FAILED
- [x] Transferring zero or a negative amount is rejected with an error (the Money value object refuses to represent zero or negative transfer amounts)
- [x] Transferring from a non-existent account returns a not-found error
- [x] Transferring to a non-existent account returns a not-found error
- [x] A transfer is atomic -- if any part of the operation fails mid-way, no account balances are changed
- [x] A successful transfer produces a TransferCompleted domain event containing the transfer id, source account id, destination account id, amount, and timestamp
- [x] A failed transfer (insufficient funds) produces a TransferFailed domain event containing the transfer id, source account id, destination account id, amount, and failure reason
- [x] Domain events are collected during the operation and dispatched after persistence succeeds -- they are not fired inline during aggregate method calls
- [x] The application service orchestrates (load aggregates, invoke methods, persist, dispatch events) but does not contain business rules -- those live on the aggregates

### DDD Notes (for implementer)

This slice makes the DDD tactical pattern payoff concrete:

| Responsibility | Where it lives in DDD |
|---|---|
| Insufficient funds rule | Account aggregate's `debit()` method -- the aggregate refuses to violate its invariant |
| "Amount must be positive" rule | Money value object -- it refuses to be constructed with a non-positive value |
| Transfer orchestration | Application service -- loads aggregates, calls `debit()` and `credit()`, persists, dispatches events |
| What happened (audit trail) | Domain events -- TransferCompleted or TransferFailed records the outcome as a first-class domain concept |
| Transaction atomicity | Infrastructure -- repository implementation wraps persistence in a database transaction |

**Domain event flow**: The application service (or the aggregate itself) creates domain events during the operation. Events are collected (not immediately dispatched). After the transaction commits successfully, events are dispatched. For this learning project, dispatching means making them available for retrieval (stored alongside the transfer) -- no external message bus is needed.

**Contrast with Clean Architecture (Phase 4)**: In Clean, `Account.debit()` existed but the entity was thin -- it was more of a data holder that could validate. In DDD, the Account aggregate is the authority: `account.debit(money)` either succeeds (mutating internal state) or throws a domain error. There is no service checking `if (account.balance < amount)` before calling debit -- the aggregate handles it. Additionally, Clean had no concept of domain events. The transfer either succeeded or threw an error. Here, the outcome is captured as an explicit event.

**Contrast with Onion (Phase 3)**: In Onion, a separate domain service layer owned the insufficient-funds rule. The application service called the domain service, which checked the rule, then the application service orchestrated persistence. In DDD, there is no separate domain service for this rule -- the aggregate owns it directly. The domain service layer from Onion collapses into aggregate behavior.

**Contrast with N-tier (Phase 1)**: In N-tier, the insufficient-funds rule was an `if` statement in a service method, mixed with orchestration logic and database transaction calls. In DDD, that same rule is an invariant protected by the Account aggregate -- structurally impossible to bypass.

## Slice 4: Transfer Retrieval + Domain Events Exposure

Read endpoint for transfers. The transfer response includes domain events that were produced during the transfer, making the "what happened" story visible to the API consumer. Completes the full API surface.

### Acceptance Criteria

- [x] A user can retrieve a transfer by its id via GET /transfers/:id
- [x] The response includes the transfer's id, source account, destination account, amount, timestamp, and status
- [x] The response includes the domain events that were produced during the transfer (e.g., TransferCompleted or TransferFailed with their details)
- [x] Requesting a non-existent transfer id returns a not-found error
- [x] Requesting a transfer with an invalid id format returns an error
- [x] A completed transfer's response shows a TransferCompleted event with correct details
- [x] A failed transfer's response shows a TransferFailed event with the failure reason

### DDD Notes (for implementer)

Domain events are stored alongside the transfer record. When retrieving a transfer, the repository loads the transfer aggregate and its associated events. The API response includes an `events` field that surfaces what happened during the transfer.

This is a preview of what Phase 6 (CQRS/Event Sourcing) will make central: events as first-class data. Here, events are a supplementary record. In Phase 6, they become the source of truth.

**Response shape extension**:
```
Transfer shape: {
  id: UUID,
  fromAccountId: UUID,
  toAccountId: UUID,
  amount: number,
  timestamp: datetime,
  status: "COMPLETED" | "FAILED",
  events: [
    { type: "TransferCompleted" | "TransferFailed", data: {...}, timestamp: datetime }
  ]
}
```

## Out of Scope

- No authentication or authorization
- No pagination, filtering, or sorting on list endpoints
- No account closure or status transitions beyond initial ACTIVE
- No transfer history per account
- No currency handling -- Money wraps a number, not a currency+amount pair
- No rate limiting or request validation beyond basic field presence/type
- No CI/CD pipeline
- No shared test infrastructure with other architecture phases
- No external event bus or message broker -- domain events are stored and retrieved, not published to external systems
- No event sourcing -- events are supplementary records, not the source of truth (that is Phase 6)
- No CQRS -- single model for reads and writes (that is Phase 6)
- No saga or process manager patterns -- transfer is a single-step operation

## API Shape (indicative -- identical to Phases 1-4 except transfer response includes events)

```
POST   /accounts           { owner: string, balance: number }           -> Account
GET    /accounts/:id                                                     -> Account
GET    /accounts                                                         -> Account[]
POST   /transfers          { fromAccountId: UUID, toAccountId: UUID, amount: number } -> Transfer
GET    /transfers/:id                                                    -> Transfer (with events)
```

Account shape: `{ id: UUID, owner: string, balance: number, status: "ACTIVE" }`

Transfer shape: `{ id: UUID, fromAccountId: UUID, toAccountId: UUID, amount: number, timestamp: datetime, status: "COMPLETED" | "FAILED", events: [{ type: string, data: object, timestamp: datetime }] }`

## Technical Context

- **Stack**: NestJS, TypeScript, Drizzle ORM, PostgreSQL, Vitest
- **Architecture**: DDD tactical patterns -- aggregates (Account as aggregate root), value objects (Money, AccountId), domain events (TransferCompleted, TransferFailed), repositories that work with whole aggregates
- **Project location**: `ddd/` directory, fully independent with own package.json and docker-compose.yml
- **Testing philosophy**: Behavioral tests. Value objects tested in complete isolation (pure validation and equality). Aggregates tested by invoking methods and asserting on state and emitted events -- no database, no framework. Application services tested with in-memory repository implementations. Integration tests use full HTTP round-trips against a real database. No mocking implementation details.
- **Risk level**: LOW
- **Patterns to follow**: NestJS modules for dependency injection wiring in infrastructure. Drizzle for schema and queries (infrastructure only). Vitest for all tests. Aggregates own invariants. Value objects are immutable and validated on creation. Domain events are collected and dispatched after persistence.

## Key Contrast: N-tier vs Hexagonal vs Onion vs Clean vs DDD

| Concern | N-tier (Phase 1) | Hexagonal (Phase 2) | Onion (Phase 3) | Clean (Phase 4) | DDD (Phase 5) |
|---|---|---|---|---|---|
| Business rules location | Service layer (procedural checks) | Domain core (no framework imports) | Domain services layer (separate from orchestration) | Entities (enforce own invariants, but thin) | Aggregate roots (rich behavior, full invariant protection) |
| Identity representation | Plain string/UUID | Plain string/UUID | Plain string/UUID | Plain string/UUID | AccountId value object (validated, value equality) |
| Money/amount representation | Plain number | Plain number | Plain number | Plain number | Money value object (validated, immutable, arithmetic operations) |
| Insufficient funds rule | `if` in service | `if` in domain core | Domain service method | Entity method (Account.debit throws) | Aggregate behavior (Account.debit refuses -- the aggregate protects its invariant) |
| Side effects / "what happened" | Implicit (success or exception) | Implicit (success or exception) | Implicit (success or exception) | Implicit (success or exception) | Explicit domain events (TransferCompleted, TransferFailed) |
| Repository contract | Returns raw data / ORM entities | Returns domain objects through ports | Returns domain objects through interfaces | Returns entities through gateway interfaces | Returns fully reconstituted aggregates with value objects |
| Orchestration location | Service method | Application service | Application service (separate from domain service) | Use case interactor (one per operation) | Application service (loads aggregates, invokes aggregate methods, dispatches events) |
| Transaction management | Service calls `db.transaction()` | Adapter handles through port | Infrastructure handles through interface | Infrastructure gateway wraps in transaction | Infrastructure repository wraps in transaction |
| Testability of business rules | Needs service + mocked repo | Domain tested with in-memory adapters | Domain services tested with plain objects | Entities tested in isolation | Value objects tested in pure isolation; aggregates tested by invoking methods and checking state + events |
| What separates this from the previous | Baseline | Dependency inversion + ports | Explicit layers + domain/app service split | One use case per operation + explicit DTOs | Aggregates with rich behavior + value objects + domain events |

## Aha-Moment Checkpoint

After completing this phase, try these experiments:

1. **Read the Account aggregate's debit method.** It does not check a condition and return a boolean. It either succeeds (mutating the aggregate's balance) or refuses (throwing a domain error). The insufficient-funds rule is not a check performed on the aggregate -- it is the aggregate protecting itself. Compare this to the N-tier version where it was an `if` in a service method.

2. **Try to create a Money value object with a negative amount.** It refuses. Now try to pass a raw number where Money is expected. The type system stops you. In all prior phases, a negative amount could sneak through to unexpected places before a validation check caught it. Here, the value object makes illegal states unrepresentable at the type level.

3. **Look at the domain events after a transfer.** The transfer does not just succeed or fail silently -- it produces an explicit event that records what happened. Compare this to Phase 4 where the transfer either returned a result or threw an exception. Events make the "what happened" story a first-class concept.

4. **Compare the application service to the Onion version (Phase 3).** In Onion, the application service called a domain service which checked the insufficient-funds rule. Here, the application service calls `account.debit(money)` and the aggregate handles it. The domain service layer is gone -- the aggregate absorbed it. Notice how the application service is thinner because the domain is richer.

5. **Try to modify an Account's balance directly.** The aggregate should not expose a `setBalance()` method. The only way to change the balance is through `debit()` and `credit()` -- the aggregate controls all state transitions. This is the aggregate root pattern: the outside world interacts with behavior, not data.

[ ] Reviewed
