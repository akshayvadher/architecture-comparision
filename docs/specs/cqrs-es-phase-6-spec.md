# Spec: CQRS / Event Sourcing -- Banking/Money Transfer (Phase 6)

## Overview

Rebuild the same banking domain from Phases 1-5 using CQRS (Command Query Responsibility Segregation) with Event Sourcing. The behavior is identical -- same five endpoints, same business rules, same API shape (plus a new event stream endpoint). What changes is fundamental: the source of truth is no longer rows in a database table. It is an append-only sequence of events. The "current balance" is not stored -- it is a projection derived by replaying the event stream. The write side receives commands, loads aggregates by replaying their events, produces new events, and appends them to the event store. The read side maintains projections (read models) that are updated synchronously whenever new events are appended.

**Learning goal**: Experience the moment where you query an account's event stream and see every deposit, debit, and transfer that ever happened. Realize that "current balance" is just one of many possible projections you could build from the same events. The mental model shift -- state is derived, not stored -- is the hardest concept in this entire project.

## Slice 1: Project Setup + Event Store + Account Aggregate (Event-Sourced) + CreateAccount Command

The walking skeleton: a running NestJS app with CQRS/ES infrastructure. The event store is an append-only PostgreSQL table. The Account aggregate is reconstituted by replaying its event stream (not by loading a row). The CreateAccount command handler validates input, produces an AccountCreated event, and appends it to the event store. No read model yet -- this slice proves the write side works.

### Acceptance Criteria

- [x] Running `npm install` and `docker-compose up` in the `cqrs-es/` directory starts a working PostgreSQL database
- [x] Running `npm test` executes the Vitest test suite
- [x] The project has distinct directories for: commands (write side), queries (read side), domain (aggregates, events), and infrastructure (event store, controllers, framework wiring)
- [x] The event store is an append-only PostgreSQL table that stores events with at least: event id, aggregate id, aggregate type, event type, event data (JSON), version (sequence number), and timestamp
- [x] No UPDATE or DELETE operations are ever performed on the event store table
- [x] The Account aggregate is reconstituted by loading all events for that aggregate id from the event store and replaying them in order -- not by loading a row from a state table
- [x] The Account aggregate produces domain events (not direct state mutations) -- calling a method on the aggregate returns or collects events, and those events are what get persisted
- [x] An AccountCreated event contains the account id, owner name, initial balance, and status
- [x] A user can create an account by sending POST /accounts with an owner name and initial balance
- [x] The created account is returned with an id (UUID), owner, balance, and status of ACTIVE
- [x] Creating an account with a negative initial balance is rejected with an error (before any event is produced)
- [x] Creating an account without an owner name is rejected with an error
- [x] After creating an account, the event store contains exactly one AccountCreated event for that account's aggregate id
- [x] The Account aggregate can be reconstituted from its event stream -- loading the aggregate after creation produces an aggregate with the correct owner, balance, and status
- [x] Optimistic concurrency is enforced on the event store -- appending events with a version that conflicts with an existing version for the same aggregate is rejected

### CQRS/ES Notes (for implementer)

**Project structure** (`cqrs-es/src/`):
- `domain/`: Aggregate definitions (Account, Transfer), event type definitions (AccountCreated, AccountDebited, AccountCredited, TransferInitiated, TransferCompleted, TransferFailed), domain errors. Aggregates have zero framework imports.
- `commands/`: Command types (CreateAccountCommand, InitiateTransferCommand) and command handlers. Each handler loads an aggregate from the event store, invokes aggregate behavior, and appends the resulting events.
- `queries/`: Query types (GetAccountQuery, ListAccountsQuery, GetTransferQuery) and query handlers. Each handler reads from the projection tables (read models), not from the event store.
- `projections/`: Projection handlers that listen to events and update read model tables. One projector per read model (AccountProjection, TransferProjection).
- `infrastructure/`: Event store implementation (Drizzle + PostgreSQL), read model schema, NestJS controllers, framework wiring.

**The event store table** (indicative):
```
events
  id:             UUID        -- unique event id
  aggregate_id:   UUID        -- which aggregate this event belongs to
  aggregate_type: string      -- "Account" or "Transfer"
  event_type:     string      -- "AccountCreated", "AccountDebited", etc.
  event_data:     jsonb       -- the event payload
  version:        integer     -- sequence number within the aggregate (1, 2, 3...)
  timestamp:      timestamptz -- when the event was appended
  UNIQUE(aggregate_id, version)  -- optimistic concurrency control
```

**How aggregate reconstitution works**: To load an Account, the event store fetches all events where `aggregate_id = <id>` ordered by `version`. The aggregate starts as an empty state and applies each event in sequence:
1. AccountCreated -> sets owner, balance, status
2. AccountDebited -> subtracts from balance
3. AccountCredited -> adds to balance

The aggregate's "apply" method is a pure function: given current state + event, produce new state. This is deterministic and testable without any database.

**Mental model shift from DDD (Phase 5)**: In DDD, `account.debit(money)` mutated the aggregate's internal state directly and optionally produced a domain event as a side effect. In CQRS/ES, `account.debit(money)` produces an AccountDebited event and nothing else. The state change happens only when that event is applied. Events are not a side effect -- they ARE the state change.

**Optimistic concurrency**: When appending events, include the expected version. If another command has already appended events to the same aggregate (version conflict), the append fails. This prevents two concurrent transfers from both reading the same balance and both succeeding. For this learning project, a simple retry or an error response is sufficient.

## Slice 2: Account Projections (Read Model) + Account Query Endpoints

The read side: projection handlers that consume events and build read model tables. Query handlers read from these projections, not from the event store. After this slice, accounts can be created (write side) and queried (read side).

### Acceptance Criteria

- [x] A read model table for accounts exists, storing the current state of each account (id, owner, balance, status)
- [x] When an AccountCreated event is appended to the event store, the account projection is updated synchronously to reflect the new account
- [x] A user can retrieve an account by its id via GET /accounts/:id
- [x] The response includes the account's id, owner, balance, and status
- [x] Requesting a non-existent account id returns a not-found error
- [x] Requesting an account with an invalid id format returns an error
- [x] A user can list all accounts via GET /accounts
- [x] When no accounts exist, the list endpoint returns an empty collection
- [x] When multiple accounts exist, all are returned in the list
- [x] The GET endpoints read from the projection table (read model), not from the event store
- [x] The query handlers are separate from the command handlers -- they live in different modules and use different data access paths
- [x] The projection can be rebuilt from scratch by replaying all events from the event store (even if not exposed as an endpoint, this should be possible programmatically)

### CQRS/ES Notes (for implementer)

**Read model tables** (indicative):
```
account_read_model
  id:       UUID
  owner:    string
  balance:  number
  status:   string
```

This is a denormalized view optimized for reads. It is NOT the source of truth -- the event store is. If the read model is ever wrong, you can delete it and rebuild it by replaying all events.

**Projection handler flow**: After the command handler appends events to the event store, the projection handler is called synchronously (for this learning project -- no message bus, no eventual consistency). The projector receives the event and updates the read model:
- AccountCreated -> INSERT into account_read_model
- AccountDebited -> UPDATE balance (subtract)
- AccountCredited -> UPDATE balance (add)

**Synchronous projections (simplification for learning)**: In production CQRS/ES, projections are often updated asynchronously via a message bus, introducing eventual consistency. For this learning project, projections are updated synchronously in the same transaction as the event append. This keeps the system simple while still demonstrating the separation of write and read models.

**Contrast with all prior phases (1-5)**: In every prior phase, the GET /accounts/:id endpoint read from the same table that the POST /accounts endpoint wrote to. Here, they use completely different tables. The write side appends to the event store. The read side queries a projection table. This is the CQRS split made concrete.

## Slice 3: Transfer Command with Business Rules + Events

The write side for transfers. The transfer command loads both Account aggregates from their event streams, enforces the insufficient-funds rule on the source aggregate, and produces events (AccountDebited, AccountCredited, TransferInitiated, TransferCompleted or TransferFailed). All events are appended atomically. Account projections are updated to reflect the new balances.

### Acceptance Criteria

- [x] A user can initiate a transfer by sending POST /transfers with a source account, destination account, and amount
- [x] A successful transfer appends the following events atomically: TransferInitiated, AccountDebited (on source), AccountCredited (on destination), TransferCompleted
- [x] The source Account aggregate is loaded by replaying its event stream, and the insufficient-funds rule is checked against the replayed balance -- not against the read model
- [x] When a transfer is rejected for insufficient funds, a TransferInitiated event followed by a TransferFailed event is appended (recording what happened), but no AccountDebited or AccountCredited events are produced
- [x] Neither account's projected balance changes when a transfer fails
- [x] Transferring zero or a negative amount is rejected with an error
- [x] Transferring from a non-existent account returns a not-found error
- [x] Transferring to a non-existent account returns a not-found error
- [x] A transfer is atomic -- all events for a successful transfer are appended in one transaction, and the projections are updated in the same transaction
- [x] The account read model reflects the updated balances after a successful transfer (source debited, destination credited)
- [x] The transfer is returned with an id, source/destination account references, amount, timestamp, and status of COMPLETED (or FAILED for insufficient funds)

### CQRS/ES Notes (for implementer)

**Event sequence for a successful transfer**:
1. TransferInitiated { transferId, fromAccountId, toAccountId, amount, timestamp }
2. AccountDebited { accountId, amount, transferId }
3. AccountCredited { accountId, amount, transferId }
4. TransferCompleted { transferId, timestamp }

**Event sequence for a failed transfer (insufficient funds)**:
1. TransferInitiated { transferId, fromAccountId, toAccountId, amount, timestamp }
2. TransferFailed { transferId, reason: "Insufficient funds", timestamp }

**Why record events for failed transfers?** In prior phases, a failed transfer was either an exception (Phases 1-3) or an exception plus a stored FAILED record (Phases 4-5). In CQRS/ES, we record the attempt and its failure as events because the event store is the history of everything that happened. "An attempt was made and it failed" is a fact worth recording.

**Atomicity approach**: All events produced by a single command (the transfer) are appended in a single database transaction. The projection updates happen in the same transaction. This ensures the event store and read models are always consistent (within the simplification of synchronous projections).

**Business rule enforcement**: The insufficient-funds check happens on the Account aggregate after it has been reconstituted from its event stream. This is critical -- you are checking the rule against the event-sourced state, not against the read model projection. The aggregate is the authority for write-side validation.

**Contrast with DDD (Phase 5)**: In DDD, `account.debit(money)` mutated the aggregate's balance field in memory. Here, `account.debit(money)` produces an AccountDebited event. The aggregate's internal balance only changes when that event is applied. The write operation and the state change are decoupled by the event.

**Contrast with N-tier (Phase 1)**: In N-tier, the transfer was `UPDATE accounts SET balance = balance - amount WHERE id = source; UPDATE accounts SET balance = balance + amount WHERE id = dest;`. Two SQL updates in a transaction. Here, no row is updated -- four events are appended. The state change is a consequence of the events, not a direct mutation.

| Responsibility | Where it lives in CQRS/ES |
|---|---|
| Insufficient funds rule | Account aggregate (reconstituted from events) |
| Transfer orchestration | Command handler (InitiateTransferCommandHandler) |
| State persistence | Event store (append-only) |
| Current balance | Account projection (read model, derived from events) |
| Atomicity | Infrastructure (single transaction for all events + projection updates) |
| "What happened" | Event store -- the complete, immutable history |

## Slice 4: Transfer Projections + Transfer Query Endpoint + Account Event Stream

The read side for transfers plus the signature CQRS/ES feature: exposing the raw event stream for an account. After this slice, the full API surface is complete and the "aha moment" endpoint is available.

### Acceptance Criteria

- [x] A read model table for transfers exists, storing the current state of each transfer (id, from account, to account, amount, timestamp, status)
- [x] When transfer events are appended, the transfer projection is updated synchronously
- [x] A user can retrieve a transfer by its id via GET /transfers/:id
- [x] The response includes the transfer's id, source account, destination account, amount, timestamp, and status
- [x] Requesting a non-existent transfer id returns a not-found error
- [x] Requesting a transfer with an invalid id format returns an error
- [x] A completed transfer shows a status of COMPLETED
- [x] A failed transfer shows a status of FAILED
- [x] A user can view the full event history of an account via GET /accounts/:id/events
- [x] The event stream endpoint returns all events for the given account, ordered chronologically
- [x] After creating an account and performing transfers, the event stream shows AccountCreated, AccountDebited, and AccountCredited events in order
- [x] Each event in the stream includes the event type, event data, version number, and timestamp
- [x] The event stream endpoint returns a not-found error for a non-existent account id

### CQRS/ES Notes (for implementer)

**Transfer read model table** (indicative):
```
transfer_read_model
  id:              UUID
  from_account_id: UUID
  to_account_id:   UUID
  amount:          number
  timestamp:       timestamptz
  status:          string   -- "COMPLETED" | "FAILED"
```

**Transfer projection handler**:
- TransferInitiated -> INSERT with status PENDING (or skip -- just use TransferCompleted/Failed)
- TransferCompleted -> UPDATE status to COMPLETED (or INSERT with COMPLETED)
- TransferFailed -> UPDATE status to FAILED (or INSERT with FAILED)

The exact projection strategy is up to the implementer. The simplest approach: only project on TransferCompleted/TransferFailed since those are terminal states.

**The event stream endpoint** (`GET /accounts/:id/events`) is the showcase for this entire phase. This endpoint reads directly from the event store (not from a projection). It returns the raw events for a given aggregate id, which tells the complete history of that account:

```json
[
  { "type": "AccountCreated", "data": { "owner": "Alice", "balance": 1000 }, "version": 1, "timestamp": "..." },
  { "type": "AccountDebited", "data": { "amount": 200, "transferId": "..." }, "version": 2, "timestamp": "..." },
  { "type": "AccountCredited", "data": { "amount": 50, "transferId": "..." }, "version": 3, "timestamp": "..." }
]
```

This is data that NO prior phase could provide. In Phases 1-5, if you wanted to know "what happened to this account?", you could only look at the current balance. Here, you have the full history -- every event, in order, with details.

**Aha-moment implementation**: The event stream endpoint is the final piece. When the developer creates an account, performs several transfers, and then queries the event stream, they see the complete story of that account. The "current balance" is revealed to be just a summary -- one of infinitely many projections you could build from the same events.

## Out of Scope

- No authentication or authorization
- No pagination, filtering, or sorting on list endpoints
- No account closure or status transitions beyond initial ACTIVE
- No currency handling -- all amounts are plain numbers
- No rate limiting or request validation beyond basic field presence/type
- No CI/CD pipeline
- No shared test infrastructure with other architecture phases
- No eventual consistency -- projections are updated synchronously (a production system would typically use async projections)
- No external message bus or event bus (Kafka, RabbitMQ, etc.)
- No snapshot optimization for aggregate reconstitution (replay all events every time -- acceptable for a learning project with small event streams)
- No saga or process manager patterns -- transfer is handled in a single command
- No event versioning or event upcasting (schema evolution)
- No CQRS without Event Sourcing (this phase combines both)
- No separate read/write databases -- single PostgreSQL instance with separate tables

## API Shape (indicative)

```
POST   /accounts             { owner: string, balance: number }           -> Account
GET    /accounts/:id                                                       -> Account (from read model)
GET    /accounts                                                           -> Account[] (from read model)
POST   /transfers            { fromAccountId: UUID, toAccountId: UUID, amount: number } -> Transfer
GET    /transfers/:id                                                      -> Transfer (from read model)
GET    /accounts/:id/events                                                -> Event[] (from event store)
```

Account shape: `{ id: UUID, owner: string, balance: number, status: "ACTIVE" }`

Transfer shape: `{ id: UUID, fromAccountId: UUID, toAccountId: UUID, amount: number, timestamp: datetime, status: "COMPLETED" | "FAILED" }`

Event shape: `{ type: string, data: object, version: number, timestamp: datetime }`

## Technical Context

- **Stack**: NestJS, TypeScript, Drizzle ORM, PostgreSQL, Vitest
- **Architecture**: CQRS with Event Sourcing -- separate command and query models, event store as source of truth, projections as read models, aggregates reconstituted from event streams
- **Project location**: `cqrs-es/` directory, fully independent with own package.json and docker-compose.yml
- **Testing philosophy**: Behavioral tests. Aggregates tested in pure isolation -- apply events, invoke commands, assert on produced events (no database). Projections tested by feeding events and asserting on read model state. Command handlers tested with in-memory event store. Integration tests use full HTTP round-trips against a real database. No mocking implementation details.
- **Risk level**: MODERATE (event sourcing is a fundamentally different mental model from all prior phases)
- **Patterns to follow**: NestJS modules for dependency injection wiring. Drizzle for event store and read model tables. Vitest for all tests. Append-only event store with optimistic concurrency. Synchronous projection updates. Aggregates produce events, not state mutations.

## Key Contrast: All Six Architecture Phases

| Concern | N-tier (Phase 1) | Hexagonal (Phase 2) | Onion (Phase 3) | Clean (Phase 4) | DDD (Phase 5) | CQRS/ES (Phase 6) |
|---|---|---|---|---|---|---|
| Source of truth | Database rows | Database rows | Database rows | Database rows | Database rows (+ supplementary events) | Event store (append-only event stream) |
| What "state" means | Current values in columns | Current values in columns | Current values in columns | Current values in columns | Current values on aggregate (with value objects) | Derived by replaying events |
| Write operation | UPDATE row | UPDATE row through port | UPDATE row through interface | UPDATE row through gateway | Mutate aggregate, persist, emit events as side effect | Produce events, append to event store, project |
| Read operation | SELECT from same table | SELECT through port (same table) | SELECT through interface (same table) | SELECT through gateway (same table) | SELECT through repository (same table) | SELECT from projection table (different table) |
| Business rules location | Service layer | Domain core | Domain services layer | Entities | Aggregate roots | Aggregates (reconstituted from events) |
| Insufficient funds rule | `if` in service | `if` in domain core | Domain service method | Entity method (Account.debit throws) | Aggregate behavior (Account.debit refuses) | Aggregate behavior (checks replayed state, produces event or rejects) |
| "What happened" history | Not available (only current state) | Not available | Not available | Not available | Domain events (supplementary -- stored alongside transfer) | Full event stream (source of truth -- every state change is an event) |
| Can you rebuild state from history? | No | No | No | No | No (events are supplementary, not complete) | Yes -- replay all events to get current state |
| Transfer atomicity | DB transaction (UPDATE + UPDATE) | DB transaction through adapter | DB transaction through infrastructure | DB transaction through gateway | DB transaction (persist aggregates + events) | DB transaction (append all events + update projections) |
| Read/write data path | Same table, same model | Same table, same model through ports | Same table, same model through layers | Same table, same model through gateways | Same table, same model through repositories | Different tables, different models (event store vs projections) |
| What separates this from previous | Baseline | Dependency inversion + ports | Explicit layers + domain/app split | One use case per operation + DTOs | Aggregates + value objects + domain events | Events as source of truth + separate read/write models |

## Aha-Moment Checkpoint

After completing this phase, try these experiments:

1. **Query the event stream.** Create an account with a balance of 1000. Transfer 200 out. Transfer 50 in. Now call `GET /accounts/:id/events`. You see three events in order: AccountCreated (balance 1000), AccountDebited (amount 200), AccountCredited (amount 50). The current balance (850) is nowhere in the event store -- it is derived. Compare this to every prior phase where the database just had a row saying "balance: 850" with no history of how it got there.

2. **Delete the read model and rebuild it.** Truncate the account_read_model table. Run the projection rebuild (replay all events). The read model is restored to the correct state. This is impossible in Phases 1-5 -- if you deleted the accounts table, the data was gone. Here, the event store is the source of truth, and the read model is disposable.

3. **Imagine a new projection.** Without changing any write-side code, you could build a new projection: "total money transferred per account" or "accounts that received money in the last hour." The events already contain all the information. In prior phases, you would need to add new columns or tables and backfill them. Here, you just write a new projector and replay the events.

4. **Compare the aggregate's debit method across phases.** In N-tier, it was an `if` check in a service. In DDD, it was `account.debit(money)` which mutated the balance and optionally emitted an event. In CQRS/ES, `account.debit(money)` produces an AccountDebited event and does not mutate the balance directly. The balance only changes when the event is applied. Events are not a side effect -- they are the mechanism of state change.

5. **Look at the event store table.** It is append-only. There are no UPDATEs, no DELETEs. Every row is an immutable fact: "this happened." This is fundamentally different from every prior phase where the database was a mutable snapshot of current state. The event store is a ledger -- which is fitting for a banking domain.

6. **Compare what you can answer.** In Phases 1-5, the system can answer: "What is Alice's current balance?" In Phase 6, it can also answer: "What was Alice's balance at 3pm yesterday?", "How many transfers has Alice received?", "What is the largest single debit Alice has ever had?" -- all from the same event stream, without any schema changes.

[x] Reviewed
