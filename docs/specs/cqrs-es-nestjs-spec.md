# Spec: CQRS / Event Sourcing with @nestjs/cqrs -- Banking/Money Transfer

## Overview

Rebuild the same banking domain from the hand-rolled CQRS/ES phase (`cqrs-es/`) using the `@nestjs/cqrs` module in a new `cqrs-es-nestjs/` folder. The behavior, API shape, business rules, and acceptance criteria are identical. What changes is the wiring: instead of hand-rolling command dispatch, query dispatch, and event routing, this variant uses `@nestjs/cqrs` primitives -- `CommandBus`, `QueryBus`, `EventBus`, `AggregateRoot` base class, `@CommandHandler`, `@QueryHandler`, and `@EventsHandler` decorators.

**Why a separate variant?** The hand-rolled version teaches how CQRS/ES works from scratch. This variant teaches how a framework can absorb the boilerplate. Comparing the two reveals which parts are essential complexity (event store, aggregates, projections) and which are incidental complexity (bus wiring, handler registration, dispatch plumbing).

### Hand-Rolled (`cqrs-es/`) vs @nestjs/cqrs (`cqrs-es-nestjs/`)

| Concern | Hand-Rolled (`cqrs-es/`) | @nestjs/cqrs (`cqrs-es-nestjs/`) |
|---|---|---|
| Command dispatch | Controller injects handler directly | Controller injects `CommandBus`, calls `bus.execute(new CreateAccountCommand(...))` |
| Query dispatch | Controller injects handler directly | Controller injects `QueryBus`, calls `bus.execute(new GetAccountQuery(...))` |
| Handler registration | Manual provider wiring | `@CommandHandler(CreateAccountCommand)` decorator auto-registers |
| Aggregate base class | Plain class | Extends `AggregateRoot` from `@nestjs/cqrs` |
| Event application in aggregate | Custom `apply()` + event collector | `this.apply(new AccountCreated(...))` from `AggregateRoot` |
| Event publishing | Command handler calls projectors directly | `AggregateRoot.commit()` publishes via `EventBus` (but see note on projections below) |
| Module setup | Standard NestJS module | `CqrsModule.forRoot()` import required |
| Command/Query/Event types | Can be interfaces or plain objects | Must be concrete classes (buses use constructor identity for routing) |

### Key Tension: Synchronous Projections

The `@nestjs/cqrs` `EventBus` uses RxJS subjects with `mergeMap` internally -- event handlers (`@EventsHandler`) fire-and-forget. The command handler does NOT await handler completion. This means if projections are wired as `@EventsHandler` classes, they execute asynchronously and tests cannot rely on the read model being updated before the command response returns.

**Recommended approach for this learning project**: Command handlers call projectors directly (as a service) after appending events to the event store, exactly as in the hand-rolled version. The `@EventsHandler` decorator is not used for projections. This keeps projections synchronous, deterministic, and testable. The `EventBus` can still be used for non-critical side effects (logging, analytics), but projections must not depend on it.

Alternative (more complex): Implement a custom `IEventPublisher` that publishes synchronously. This adds complexity without learning benefit for this project.

## Slice 1: Project Setup + Event Store + Account Aggregate (Event-Sourced) + CreateAccount Command

The walking skeleton: a running NestJS app with `@nestjs/cqrs` infrastructure. The event store is an append-only PostgreSQL table. The Account aggregate extends `AggregateRoot` and is reconstituted by replaying its event stream. The `CreateAccountCommand` is dispatched via `CommandBus`, handled by a `@CommandHandler`-decorated class, which validates input, produces an `AccountCreated` event, and appends it to the event store. No read model yet -- this slice proves the write side works.

### Acceptance Criteria

- [x] Running `npm install` and `docker-compose up` in the `cqrs-es-nestjs/` directory starts a working PostgreSQL database
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

### @nestjs/cqrs Implementation Notes

**Project structure** (`cqrs-es-nestjs/src/`):
- `domain/`: Account aggregate (extends `AggregateRoot`), event classes (`AccountCreated`, `AccountDebited`, `AccountCredited`, `TransferInitiated`, `TransferCompleted`, `TransferFailed`), domain errors. Event classes must be concrete classes (not interfaces) because `@nestjs/cqrs` uses constructor identity for routing.
- `commands/`: Command classes (`CreateAccountCommand`, `InitiateTransferCommand`) and `@CommandHandler`-decorated handler classes. Each handler loads an aggregate from the event store, invokes aggregate behavior, and appends the resulting events.
- `queries/`: Query classes (`GetAccountQuery`, `ListAccountsQuery`, `GetTransferQuery`) and `@QueryHandler`-decorated handler classes. Each handler reads from projection tables (read models).
- `projections/`: Projection services that update read model tables. Called directly by command handlers after event store append (NOT via `@EventsHandler` -- see synchronous projection note above).
- `infrastructure/`: Event store implementation (Drizzle + PostgreSQL), read model schema, NestJS controllers, `CqrsModule.forRoot()` wiring.

**Docker**: PostgreSQL on port `5439` (one above `cqrs-es/` which uses `5438`), database name `cqrs_es_nestjs_bank`, user `cqrs_es_nestjs`.

**Account aggregate with AggregateRoot**:
```typescript
// Indicative -- the aggregate extends AggregateRoot
class Account extends AggregateRoot {
  // apply() is inherited from AggregateRoot
  // On create: this.apply(new AccountCreated({ ... }))
  // The onAccountCreated() method handles state transitions internally
}
```

`AggregateRoot.apply(event, isFromHistory?)` queues events internally. `AggregateRoot.loadFromHistory(events)` replays events with `isFromHistory = true` (so they are not re-queued as uncommitted). `getUncommittedEvents()` returns the new events to persist.

**Command dispatch flow**:
1. Controller receives POST /accounts
2. Controller calls `this.commandBus.execute(new CreateAccountCommand(owner, balance))`
3. `@CommandHandler(CreateAccountCommand)` class handles it
4. Handler creates Account aggregate, calls `account.createAccount(...)` which calls `this.apply(new AccountCreated(...))`
5. Handler reads uncommitted events via `account.getUncommittedEvents()`
6. Handler appends events to event store
7. Handler returns created account data

**Module wiring**:
```typescript
@Module({
  imports: [CqrsModule.forRoot()],
  // Command/query handlers are auto-discovered via decorators
  // when registered as providers
  providers: [CreateAccountHandler, GetAccountHandler, ...],
})
```

**The event store table** (same as hand-rolled):
```
events
  id:             UUID
  aggregate_id:   UUID
  aggregate_type: string
  event_type:     string
  event_data:     jsonb
  version:        integer
  timestamp:      timestamptz
  UNIQUE(aggregate_id, version)
```

## Slice 2: Account Projections (Read Model) + Account Query Endpoints

The read side: projection services that consume events and build read model tables. Query handlers use `@QueryHandler` decorator and are dispatched via `QueryBus`. After this slice, accounts can be created (write side via `CommandBus`) and queried (read side via `QueryBus`).

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

### @nestjs/cqrs Implementation Notes

**Read model table** (same as hand-rolled):
```
account_read_model
  id:       UUID
  owner:    string
  balance:  number
  status:   string
```

**Query dispatch flow**:
1. Controller receives GET /accounts/:id
2. Controller calls `this.queryBus.execute(new GetAccountQuery(id))`
3. `@QueryHandler(GetAccountQuery)` class handles it
4. Handler queries account_read_model table via Drizzle
5. Handler returns account data (or throws not-found error)

**Query classes must be concrete classes**:
```typescript
class GetAccountQuery { constructor(public readonly id: string) {} }
class ListAccountsQuery {}
```

**Projection update flow** (synchronous, called by command handler):
1. Command handler appends events to event store
2. Command handler calls `accountProjection.applyEvents(uncommittedEvents)`
3. Projection service processes each event:
   - `AccountCreated` -> INSERT into account_read_model
   - `AccountDebited` -> UPDATE balance (subtract)
   - `AccountCredited` -> UPDATE balance (add)

The projection service is a plain NestJS `@Injectable()` -- NOT an `@EventsHandler`. This ensures synchronous execution within the same transaction as the event store append.

**Contrast with all prior phases (1-5)**: In every prior phase, GET /accounts/:id read from the same table that POST /accounts wrote to. Here, they use completely different tables and completely different dispatch paths (CommandBus vs QueryBus).

## Slice 3: Transfer Command with Business Rules + Events

The write side for transfers. The `InitiateTransferCommand` is dispatched via `CommandBus`. The handler loads both Account aggregates from their event streams, enforces the insufficient-funds rule on the source aggregate, and produces events. All events are appended atomically. Account projections are updated synchronously.

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

### @nestjs/cqrs Implementation Notes

**Command dispatch flow**:
1. Controller calls `this.commandBus.execute(new InitiateTransferCommand(fromId, toId, amount))`
2. `@CommandHandler(InitiateTransferCommand)` class handles it
3. Handler loads both Account aggregates from event store (replay events)
4. Handler calls `sourceAccount.debit(amount)` which internally calls `this.apply(new AccountDebited(...))`
5. If insufficient funds, handler produces TransferFailed event instead
6. Handler appends all events atomically to event store
7. Handler calls projection services synchronously to update read models

**Event sequence for a successful transfer**:
1. TransferInitiated { transferId, fromAccountId, toAccountId, amount, timestamp }
2. AccountDebited { accountId, amount, transferId }
3. AccountCredited { accountId, amount, transferId }
4. TransferCompleted { transferId, timestamp }

**Event sequence for a failed transfer (insufficient funds)**:
1. TransferInitiated { transferId, fromAccountId, toAccountId, amount, timestamp }
2. TransferFailed { transferId, reason: "Insufficient funds", timestamp }

**Why record events for failed transfers?** The event store is the history of everything that happened. "An attempt was made and it failed" is a fact worth recording.

**Business rule enforcement**: The insufficient-funds check happens on the Account aggregate after it has been reconstituted from its event stream. This is critical -- you are checking the rule against the event-sourced state, not against the read model projection. The aggregate is the authority for write-side validation.

| Responsibility | Where it lives |
|---|---|
| Insufficient funds rule | Account aggregate (extends `AggregateRoot`, reconstituted from events) |
| Transfer orchestration | `@CommandHandler(InitiateTransferCommand)` |
| Command dispatch | `CommandBus.execute()` |
| State persistence | Event store (append-only) |
| Current balance | Account projection (read model, updated synchronously by projection service) |
| Atomicity | Infrastructure (single transaction for all events + projection updates) |

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

### @nestjs/cqrs Implementation Notes

**Transfer read model table** (same as hand-rolled):
```
transfer_read_model
  id:              UUID
  from_account_id: UUID
  to_account_id:   UUID
  amount:          number
  timestamp:       timestamptz
  status:          string   -- "COMPLETED" | "FAILED"
```

**Transfer projection handler**: The simplest approach -- project on TransferCompleted/TransferFailed since those are terminal states. Called synchronously by the command handler (same pattern as account projections).

**Event stream query dispatch**:
1. Controller calls `this.queryBus.execute(new GetAccountEventsQuery(accountId))`
2. `@QueryHandler(GetAccountEventsQuery)` class handles it
3. Handler reads directly from the event store (not from a projection)
4. Returns raw events ordered by version

**Event stream response shape**:
```json
[
  { "type": "AccountCreated", "data": { "owner": "Alice", "balance": 1000 }, "version": 1, "timestamp": "..." },
  { "type": "AccountDebited", "data": { "amount": 200, "transferId": "..." }, "version": 2, "timestamp": "..." },
  { "type": "AccountCredited", "data": { "amount": 50, "transferId": "..." }, "version": 3, "timestamp": "..." }
]
```

This is data that NO prior phase could provide. In Phases 1-5, if you wanted to know "what happened to this account?", you could only look at the current balance. Here, you have the full history.

## Out of Scope

- No authentication or authorization
- No pagination, filtering, or sorting on list endpoints
- No account closure or status transitions beyond initial ACTIVE
- No currency handling -- all amounts are plain numbers
- No rate limiting or request validation beyond basic field presence/type
- No CI/CD pipeline
- No shared test infrastructure with other architecture phases
- No eventual consistency -- projections are updated synchronously (a production system would typically use async projections via `@EventsHandler`)
- No external message bus or event bus (Kafka, RabbitMQ, etc.)
- No snapshot optimization for aggregate reconstitution (replay all events every time)
- No saga or process manager patterns -- transfer is handled in a single command
- No event versioning or event upcasting (schema evolution)
- No CQRS without Event Sourcing (this phase combines both)
- No separate read/write databases -- single PostgreSQL instance with separate tables
- No use of `@EventsHandler` for projections (synchronous projections called directly by command handlers for determinism)
- No use of `AggregateRoot.commit()` / `EventBus` for projection updates (projections bypass the EventBus)

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
- **Key dependency**: `@nestjs/cqrs` module (CommandBus, QueryBus, EventBus, AggregateRoot, decorators)
- **Architecture**: CQRS with Event Sourcing -- same as `cqrs-es/` but wired with `@nestjs/cqrs` primitives
- **Project location**: `cqrs-es-nestjs/` directory, fully independent with own package.json and docker-compose.yml
- **Docker**: PostgreSQL on port `5439`, database `cqrs_es_nestjs_bank`, user `cqrs_es_nestjs`
- **Testing philosophy**: Behavioral tests. Aggregates tested in pure isolation (apply events, invoke commands, assert on produced events -- AggregateRoot's `getUncommittedEvents()` is useful here). Projections tested by feeding events and asserting on read model state. Command handlers tested with in-memory event store. Integration tests use full HTTP round-trips against a real database. No mocking implementation details.
- **Risk level**: MODERATE (same domain as `cqrs-es/` but different wiring patterns; need to understand `AggregateRoot` lifecycle and `CommandBus`/`QueryBus` dispatch)
- **Patterns to follow**: `CqrsModule.forRoot()` for module setup. `@CommandHandler`/`@QueryHandler` decorators for handler registration. `CommandBus.execute()`/`QueryBus.execute()` for dispatch. `AggregateRoot` base class for aggregates. Concrete classes (not interfaces) for commands, queries, and events. Synchronous projections via direct service calls (not `@EventsHandler`).

## Aha-Moment Checkpoint

After completing this phase, try these experiments:

1. **Query the event stream.** Create an account with a balance of 1000. Transfer 200 out. Transfer 50 in. Now call `GET /accounts/:id/events`. You see three events in order: AccountCreated (balance 1000), AccountDebited (amount 200), AccountCredited (amount 50). The current balance (850) is nowhere in the event store -- it is derived.

2. **Delete the read model and rebuild it.** Truncate the account_read_model table. Run the projection rebuild (replay all events). The read model is restored to the correct state. The event store is the source of truth, and the read model is disposable.

3. **Compare the two CQRS/ES implementations.** Open `cqrs-es/` and `cqrs-es-nestjs/` side by side. The domain layer (aggregates, events, business rules) should be nearly identical. The wiring layer is where they diverge: hand-rolled dispatch vs `CommandBus`/`QueryBus`, manual handler registration vs `@CommandHandler`/`@QueryHandler` decorators, plain aggregate class vs `AggregateRoot` base class. The essential complexity is the same; the incidental complexity is absorbed by the framework.

4. **Notice what `AggregateRoot` gives you.** The `apply()`, `getUncommittedEvents()`, and `loadFromHistory()` methods are exactly what you hand-built in `cqrs-es/`. The framework version is standardized and well-tested, but the concept is identical.

5. **Notice what you still own.** The event store, projections, and aggregate reconstitution logic are still yours. `@nestjs/cqrs` does not provide an event store -- it provides the dispatch and wiring layer. The persistence is your responsibility.

6. **Ask yourself: which version do you prefer?** There is no right answer. The hand-rolled version teaches more. The `@nestjs/cqrs` version is more conventional. Both produce the same behavior. Understanding both gives you the vocabulary to choose.
