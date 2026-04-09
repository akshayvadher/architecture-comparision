# Architecture Comparison

Seven implementations of the same banking domain. Same API, same tech stack, same business rules. Only the architecture changes.

---

## 1. Overview Table

| | N-Tier | Hexagonal | Onion | Clean | DDD | CQRS/ES (hand-rolled) | CQRS/ES (@nestjs/cqrs) |
|---|---|---|---|---|---|---|---|
| **Layers** | 3 (controller, service, repository) | 3 (adapters, application, domain) | 4 (infrastructure, application, domain services, domain model) | 4 (infrastructure, interface adapters, use cases, entities) | 3 (infrastructure, application, domain) | Write side (commands, aggregates, event store) + Read side (projections, queries) | Same as hand-rolled + framework buses |
| **Dependency direction** | Top-down (controller -> service -> repository) | Inward (adapters -> core) | Inward only | Inward only | Inward only | Inward; event store bridges write/read | Inward; buses route commands/queries |
| **Business rules live in** | Service layer (procedural) | Domain models + factory functions | Domain model (interfaces + factories) + domain services (pure functions) | Entity classes (Account.debit/credit) | Aggregates (Account.debit enforces invariants) + value objects | Aggregate (Account.apply produces events) | Aggregate extends AggregateRoot |
| **Domain model style** | Interfaces (data shapes only) | Interfaces + factory functions | Interfaces + factory functions + pure domain service | Classes with behavior (debit/credit methods) | Rich classes: aggregates, value objects, domain events | Event-sourced aggregate (state from events) | Event-sourced aggregate (framework base class) |
| **Persistence abstraction** | Concrete repository classes | Port interfaces (injected by token) | Repository interfaces in domain layer | Gateway interfaces in use-cases layer | Repository interfaces in domain layer | Event store (append-only) + projections | Event store + projections |
| **Transaction mechanism** | Service manages `db.transaction()` directly | UnitOfWork port (domain defines, infra implements) | UnitOfWork interface in domain | UnitOfWork gateway in use-cases | UnitOfWork interface in domain | Batch event append (single INSERT) | Batch event append (single INSERT) |
| **Error handling** | NestJS exceptions thrown from services | Domain error classes + error filter in adapter | Domain error classes + error filter in infrastructure | Domain error classes + error filter in interface adapters | Domain error classes + error filter in infrastructure | Domain error classes + error filter | Domain error classes + error filter |
| **Framework coupling** | High (NestJS exceptions in services) | Low (NestJS only in adapters + module) | Low (NestJS only in infrastructure) | Medium (@Injectable on use cases) | Low (NestJS only in infrastructure) | Low (NestJS only in controllers + module) | Medium (aggregate extends @nestjs/cqrs AggregateRoot) |
| **Source files** | 13 | 18 | 19 | 33 | 24 | 20 | 26 |
| **Test files** | 7 | 10 | 12 | 12 | 14 | 6 | 6 |

---

## 2. Detailed Comparison by Concern

### Where Business Rules Live

| Architecture | Location | Style |
|---|---|---|
| **N-Tier** | `accounts.service.ts`, `transfers.service.ts` | Procedural. Validation and balance checks are `if` statements in service methods. No domain objects with behavior. |
| **Hexagonal** | `domain/models/` (factory functions) + `application/` (services) | Functional. `createAccount()` validates; services orchestrate. Domain models are interfaces, not classes. |
| **Onion** | `domain/model/` (factories) + `domain/services/` (pure functions) + `application/` (orchestration) | Functional. `executeTransfer()` is a pure function: takes two accounts + amount, returns new states. Zero side effects. |
| **Clean** | `entities/` (classes with methods) + `use-cases/` (one class per operation) | OOP. `Account.debit()` enforces the balance invariant. Use cases orchestrate entities and gateways. |
| **DDD** | `domain/aggregates/` + `domain/value-objects/` | Rich domain model. `Account.debit(money)` is the only way to reduce a balance. `Money` rejects negatives at construction. Value objects replace primitives. |
| **CQRS/ES (hand-rolled)** | `domain/aggregates/account.ts` | Event-sourced aggregate. `account.debit()` checks balance, returns a domain event. State is derived from events, not stored directly. |
| **CQRS/ES (@nestjs/cqrs)** | `domain/aggregates/account.ts` (extends AggregateRoot) | Same as hand-rolled, but `apply()` mutates internal state via `onXxx()` convention methods. |

**Key insight**: The progression from N-Tier to DDD is a progression from "rules as procedural checks in services" to "rules as enforced invariants in domain objects." CQRS/ES takes this further: the aggregate not only enforces rules but produces an event record of every state change.

### How Persistence Is Abstracted (or Not)

| Architecture | Abstraction | Can swap DB without touching business logic? |
|---|---|---|
| **N-Tier** | None. Services call concrete repository classes directly. | No. Repository classes are directly injected. |
| **Hexagonal** | Port interfaces + DI tokens. Domain defines what it needs, adapters implement. | Yes. Write new adapters, rebind three tokens. |
| **Onion** | Repository interfaces in `domain/services/`. Same pattern as Hexagonal but interfaces live deeper. | Yes. Same mechanism. |
| **Clean** | Gateway interfaces in `use-cases/gateways/` with Symbol tokens. | Yes. Implement new gateways, rebind in module. |
| **DDD** | Repository interfaces in `domain/repositories/`. | Yes. Same mechanism. |
| **CQRS/ES** | Event store is the single persistence abstraction. Read models are projections, not repositories. | Partially. The event store is a specific pattern. Swapping the DB under the event store is possible; changing away from event sourcing is a rewrite. |

**Key insight**: Every architecture except N-Tier uses dependency inversion for persistence. The real question is not "can you swap databases" (you almost never do) but "can you test business logic without a database." That is where the abstraction pays off.

### How Testing Is Approached

| Architecture | Unit tests | What they test without a DB |
|---|---|---|
| **N-Tier** | Service-level tests with real DB | Nothing. All tests require the database. |
| **Hexagonal** | In-memory adapter tests | Services + domain logic (full business rules, no DB) |
| **Onion** | Pure domain tests + in-memory repo tests | Domain model, domain services, application services |
| **Clean** | Entity tests + use case tests with in-memory gateways | Entity invariants, every use case |
| **DDD** | Aggregate tests + value object tests + service tests with in-memory repos | All domain logic including invariants, value object construction, cross-aggregate orchestration |
| **CQRS/ES (hand-rolled)** | Aggregate unit tests | Aggregate creation, event application, reconstitution |
| **CQRS/ES (@nestjs/cqrs)** | Aggregate unit tests | Same: apply, loadFromHistory, getUncommittedEvents |

**Key insight**: N-Tier has zero tests that run without a database. Every other architecture can test business logic in isolation. The CQRS/ES projects have fewer test files (6 vs 12-14) but their integration tests are more thorough because they verify the full event store -> projection -> query pipeline.

### How the Transfer Operation Is Implemented

This is the most complex operation: it crosses two aggregates, requires atomicity, and has a failure case (insufficient funds) that must be recorded.

**N-Tier**: `TransfersService.executeTransfer()` opens a `db.transaction()`, calls `AccountsRepository.findByIdForUpdate()` to lock rows, does arithmetic, calls `updateBalance()` twice and `insert()` once. On insufficient funds, the transaction rolls back and a separate `insertWithDefaultDb()` records the FAILED transfer. The service owns the transaction handle and passes it to repository methods.

**Hexagonal / Onion / DDD**: `TransferService.executeTransfer()` calls `unitOfWork.execute()`, which wraps the callback in a DB transaction. Inside: load accounts (with locking), call domain logic (debit/credit), persist updated entities + transfer. On insufficient funds: catch the domain error, save FAILED transfer outside the transaction. The service never touches `db.transaction()` directly.

**Clean Architecture**: `InitiateTransferUseCase.execute()` does the same as above but with explicit Input/Output DTOs. The use case class is dedicated to this one operation. Entity `Account.debit()` enforces the balance check.

**CQRS/ES (both)**: `InitiateTransferHandler` loads both account aggregates by replaying their events. Calls `sourceAccount.debit()` which produces a domain event (not a state mutation). Calls `destinationAccount.credit()`. Batch-appends all events (TransferInitiated + AccountDebited + AccountCredited) in a single INSERT with optimistic concurrency. Then synchronously updates projections. On insufficient funds: appends TransferInitiated + TransferFailed events instead.

**Key insight**: The transfer operation is where architecture differences become most visible. N-Tier manages transactions manually in the service. Hexagonal/Onion/DDD abstract it behind UnitOfWork. Clean adds explicit use case boundaries. CQRS/ES replaces the entire paradigm: there is no "update balance" -- there is only "append events."

### How Errors Flow from Domain to HTTP

| Architecture | Domain throws | Translation layer | HTTP response |
|---|---|---|---|
| **N-Tier** | `BadRequestException`, `NotFoundException` (NestJS types) | None needed -- errors ARE HTTP errors | NestJS default handler |
| **Hexagonal** | `InsufficientFundsError`, `AccountNotFoundError` (custom Error subclasses) | `DomainErrorFilter` maps `error.name` -> status code | Error filter returns `{ statusCode, message }` |
| **Onion** | Same as Hexagonal | Same pattern | Same |
| **Clean** | Same as Hexagonal | Same pattern (in interface-adapters layer) | Same |
| **DDD** | Same + typed domain errors with structured data | Same pattern | Same |
| **CQRS/ES** | Same + `ConcurrencyError` (mapped to 409) | Same pattern | Same |

**Key insight**: N-Tier is the only architecture where services throw framework-specific exceptions. Every other architecture has a dedicated translation layer (error filter) that maps domain errors to HTTP status codes. This is a small change with big implications: it means the domain code can be used outside HTTP (CLI, message handler, etc.) without dragging NestJS along.

---

## 3. Pros and Cons

### N-Tier

**Pros**
- Fastest to understand. Request flow is linear: controller -> service -> repository -> DB.
- Minimal ceremony. 13 source files for the entire app.
- NestJS was designed for this. Modules, services, controllers map directly to layers.
- Fast to scaffold. Copy a module, rename, done.

**Cons**
- Business logic coupled to NestJS (throws `BadRequestException`).
- No domain model. Validation is procedural `if` statements in services.
- Cannot test business logic without a database.
- Cross-module coupling: TransfersService depends on AccountsRepository directly.
- Transaction management leaks into the service layer (passing `tx` handles).

### Hexagonal

**Pros**
- Testable without infrastructure. In-memory adapters prove zero framework coupling.
- Swappable infrastructure. New adapters + rebind tokens = new database.
- Clear dependency direction. Domain imports nothing from adapters.
- Explicit contracts. Port interfaces document what the domain needs.

**Cons**
- UnitOfWork duplicates repository mapping logic.
- Boilerplate: port interface + token + adapter per domain concept.
- In-memory UnitOfWork does not simulate rollback, leaving a testing gap.
- Indirection cost. Request traces jump through more files.

### Onion

**Pros**
- Domain is completely isolated. Zero framework imports.
- Pure domain services (`executeTransfer` as a pure function) are trivially testable.
- Testability at every layer: domain, application, integration.
- Transaction logic abstracted behind UnitOfWork interface.

**Cons**
- More files than Hexagonal for the same benefit.
- Repository duplication inside UnitOfWork (same as Hexagonal).
- Domain uses interfaces, not classes -- anyone can construct invalid state by spreading objects.
- UUID validation duplicated across application services.

### Clean Architecture

**Pros**
- One class per use case makes each operation explicit and independently testable.
- Input/Output DTOs create crystal-clear contracts at use case boundaries.
- Entity classes (`Account.debit()`) enforce invariants.
- Gateway interfaces are structural, not just conventional.

**Cons**
- File explosion: 33 source files. 15 files for 5 use cases (input + output + class each).
- Double mapping: entity -> use case output -> presenter response.
- Presenter layer adds nearly nothing when API shape matches domain shape.
- Transactional gateway duplication (same UnitOfWork problem).
- `@Injectable()` on use cases technically couples them to NestJS.

### DDD Tactical Patterns

**Pros**
- Business rules are impossible to bypass. `Account.debit()` is the only way to reduce a balance.
- Value objects catch bugs at construction (invalid UUID, negative money).
- Domain events capture intent (TransferCompleted, TransferFailed).
- Type safety: `AccountId` and `TransferId` are distinct types.

**Cons**
- Significant boilerplate for a simple domain: aggregates, value objects, events, repository interfaces, implementations, UnitOfWork copies.
- Value object unwrapping (`.value`) is manual and repetitive at every boundary.
- Domain events are persisted but never dispatched (write-only audit log).
- Repository implementations duplicated inside UnitOfWork.
- Public Account constructor means repositories re-run validation on DB data.

### CQRS/Event Sourcing (hand-rolled)

**Pros**
- Complete audit trail. Every state change is a recorded event.
- Read model is rebuildable from events (AccountProjector.rebuild()).
- Optimistic concurrency via database unique constraint -- simple and effective.
- Aggregates are pure: events in, events out.
- Failed operations are first-class (recorded as events, not swallowed).

**Cons**
- More code for the same functionality.
- Synchronous projections couple read and write sides.
- No event versioning. Schema changes to events have no migration path.
- Aggregate loading replays full history (no snapshots) -- gets slower over time.
- No Transfer aggregate. Transfer logic is procedural in the command handler.
- Event deserialization is manual and unsafe (casts to `unknown`).

### CQRS/Event Sourcing (@nestjs/cqrs)

**Pros**
- Less boilerplate for command/query dispatch (decorator-based routing).
- Standard aggregate lifecycle (apply, getUncommittedEvents, loadFromHistory).
- DI integration. Handlers are full NestJS providers.
- Familiar to NestJS teams.

**Cons**
- `onXxx` naming convention is invisible and has zero type safety. Typo = silent bug.
- Events must be class instances (not plain objects) for loadFromHistory to work.
- Event deserialization still requires a manual EVENT_CLASS_MAP.
- EventBus is async, so you cannot use `@EventsHandler` for synchronous projections.
- Framework coupling in the domain (aggregate extends AggregateRoot from @nestjs/cqrs).
- Class-heavy: separate file for every command, query, and event.

---

## 4. Gotchas (The Ones That Will Bite You)

### N-Tier
- **`balance` is `string` from Drizzle, `number` in the domain.** Miss one `parseFloat()` and you get string concatenation instead of addition.
- **TransfersService bypasses AccountsService** and calls AccountsRepository directly. Module boundaries exist in wiring but are porous in practice.
- **Two insert methods on TransfersRepository**: `insert(tx, data)` and `insertWithDefaultDb(data)`. Easy to call the wrong one.

### Hexagonal
- **UnitOfWork contains full duplicate repository implementations.** Change column mapping in one, forget the other.
- **In-memory UnitOfWork has no rollback.** Tests that rely on transaction rollback will not catch bugs.
- **Error filter catches ALL exceptions** (`@Catch()` with no type), swallowing NestJS built-in error handling.

### Onion
- **`executeTransfer()` is a pure function** (good) **but returns new objects via spread** (dangerous). Anyone can construct an `Account` with invalid state by hand -- the type system does not prevent it.
- **UUID validation is duplicated** in both application services as private functions.

### Clean Architecture
- **Presenter pass-through.** In this project, presenters copy fields 1:1. They feel like pure boilerplate until the API shape diverges from the domain.
- **Two mapping steps per property**: entity -> output DTO -> presenter response. For simple CRUD, this is busywork.
- **Gateway interfaces live in use-cases, not entities.** Developers expecting "ports in the domain layer" will look in the wrong place.

### DDD
- **Account has a public constructor, Transfer has a private one.** Repositories call `new Account(...)` directly, re-running owner validation on data already validated by the database.
- **Domain events are write-only.** Persisted to `domain_events` table but nothing reads or reacts to them. All the complexity of events, none of the reactive benefits.
- **`parseFloat` for money from DB.** The domain uses a `Money` value object to prevent invalid amounts, but the repository converts via `parseFloat()`, which can lose precision.

### CQRS/ES (hand-rolled)
- **Projections are synchronous and in-process.** If the projection write fails after events are appended, the read model is stale. No outbox, no retry.
- **No Transfer aggregate.** Transfers are a sequence of events orchestrated procedurally in the command handler. Not event-sourced in the aggregate sense.
- **Failed transfers return 201.** The transfer is a recorded fact (TransferInitiated + TransferFailed), so it "succeeds" from the API perspective. Surprising for consumers expecting 400.

### CQRS/ES (@nestjs/cqrs)
- **`onXxx` naming is convention-based with zero compile-time checking.** Misspell `onAccountCreated` and the event is silently ignored.
- **Events must be class instances.** Pass a plain object to `loadFromHistory` and its constructor name is `Object` -- nothing happens, no error.
- **EVENT_CLASS_MAP must be maintained manually.** Every new event type must be registered, or deserialization silently breaks.

---

## 5. When to Use What

### Decision Matrix

| Situation | Recommended | Why |
|---|---|---|
| Prototype / hackathon / MVP | **N-Tier** | Minimum files, maximum speed. You can always refactor later. |
| Small team, simple CRUD, < 1 year lifetime | **N-Tier** | The overhead of abstractions is not justified. Ship it. |
| Medium team, moderate domain complexity | **Hexagonal** or **Onion** | You get testability without infrastructure and swappable adapters. The cost is ~5 extra files and one pattern to learn (ports/interfaces). |
| Large team, complex domain, long-lived product | **DDD Tactical Patterns** | Rich domain model prevents business rule bypass. Value objects catch bugs at the type level. Worth it when the domain is complex enough to justify the boilerplate. |
| Need for explicit use case documentation | **Clean Architecture** | One class per use case with Input/Output DTOs is self-documenting. Good when you need to hand off to other teams or audit business operations. |
| Audit trail is a hard requirement | **CQRS/Event Sourcing** | The event store IS the audit trail. Every state change is recorded. Projections can be rebuilt. |
| High read/write ratio, need independent scaling | **CQRS/Event Sourcing** | Separate read and write models let you optimize each independently. |
| Team already uses @nestjs/cqrs | **CQRS/ES (@nestjs/cqrs)** | Familiar patterns, less custom infrastructure. |
| Team values explicitness over convention | **CQRS/ES (hand-rolled)** | No magic. Discriminated unions, direct injection, immutable aggregates. Every line is traceable. |

### The Honest Take

**Start with N-Tier.** It is the simplest thing that works. Most projects do not need more than this. If your domain is "take data from a form, validate it, save it to a database, show it in a list," N-Tier is the right answer.

**Move to Hexagonal/Onion when** you find yourself wanting to test business logic without spinning up a database, or when you realize your service layer is growing and you want to enforce dependency direction. The step from N-Tier to Hexagonal is small: define interfaces for your repositories, inject by token, add an error filter.

**Move to Clean Architecture when** you have many distinct operations and want each one explicitly defined with clear inputs and outputs. The one-class-per-use-case pattern shines in larger codebases where "which service method does what" becomes hard to track. Do not use it for CRUD -- the overhead per operation is too high.

**Move to DDD when** the domain is genuinely complex: multiple aggregates with real invariants, value objects that prevent entire categories of bugs, cross-aggregate operations that need careful orchestration. If your "domain logic" is just validation + CRUD, DDD is a costume, not a solution.

**Move to CQRS/ES when** you have a genuine need for an audit trail, temporal queries ("what was the balance at 3pm last Tuesday?"), or independent read/write scaling. Event sourcing is a fundamentally different data model -- it is not a refactoring of CRUD, it is a replacement. The migration cost is high and the operational complexity is real (event versioning, projection rebuilds, eventual consistency).

### Do Not

- Do not use Clean Architecture for a 3-endpoint CRUD API. You will spend more time on DTOs and presenters than on business logic.
- Do not use DDD when your entities have no behavior. If `Account` is just `{ id, owner, balance }` with no methods, a value object wrapping a string is ceremony, not design.
- Do not use CQRS/ES because it sounds impressive. The operational overhead (event versioning, projection rebuilds, debugging event streams) is substantial. If you do not need temporal queries or an audit trail, you are paying the cost without getting the benefit.
- Do not skip Hexagonal/Onion and jump straight to DDD. The dependency inversion pattern is a prerequisite. Learn to define interfaces in the domain and implement them in infrastructure before adding aggregates and value objects.

---

## 6. Progression Path

Each architecture builds on the ideas of the previous one. This is not just a list -- it is a learning sequence.

```
N-Tier
  "Code organized by layer. Services do everything."
    |
    | + Dependency inversion (interfaces for repositories)
    | + Domain errors (instead of HTTP exceptions)
    | + Error filter (translates domain -> HTTP)
    v
Hexagonal (Ports & Adapters)
  "The domain defines what it needs. Adapters plug in."
    |
    | + Domain services as pure functions
    | + Stricter layer discipline (4 layers instead of 3)
    | + Repository interfaces owned by the domain, not the application
    v
Onion
  "Same idea as Hexagonal, but the domain owns everything — including the interfaces."
    |
    | + One class per use case (instead of service methods)
    | + Explicit Input/Output DTOs at use case boundary
    | + Presenter layer for HTTP response shaping
    | + Gateway = port (terminology shift, same concept)
    v
Clean Architecture
  "Every operation is explicit. Boundaries are enforced by DTOs."
    |
    | + Entity classes with behavior (Account.debit)
    | + Value objects (Money, AccountId) replacing primitives
    | + Domain events as first-class concepts
    | + Aggregates as consistency boundaries
    v
DDD Tactical Patterns
  "The domain model enforces its own rules. You cannot bypass invariants."
    |
    | + Events become the source of truth (not state)
    | + Append-only event store replaces mutable tables
    | + Aggregate state reconstituted from event history
    | + Separate read models (projections) for queries
    | + Optimistic concurrency via event versioning
    v
CQRS/Event Sourcing
  "State is derived from history. Every change is a recorded fact."
```

### What Each Step Adds

| Step | What you gain | What it costs |
|---|---|---|
| N-Tier -> Hexagonal | Testability without DB, swappable infrastructure, framework independence | ~5 more files, port/adapter concepts to learn |
| Hexagonal -> Onion | Pure domain services, stricter inward-only dependencies | Marginal -- mostly organizational |
| Onion -> Clean | Explicit use case classes, Input/Output DTOs, presenter layer | Significant file increase (~33 vs ~19 src files), double mapping |
| Clean -> DDD | Rich domain model, value objects, domain events, impossible-to-bypass invariants | More boilerplate (value object wrapping/unwrapping), repository duplication |
| DDD -> CQRS/ES | Full audit trail, rebuildable read models, temporal queries, independent scaling | Fundamentally different data model, operational complexity, eventual consistency concerns |

### The Uncomfortable Truth

Most applications should stop at Hexagonal or Onion. The jump from N-Tier to Hexagonal gives you 80% of the architectural benefit (testability, dependency direction, framework independence) at 20% of the cost. Each subsequent step adds real value, but the ratio of benefit to complexity gets worse. DDD and CQRS/ES solve real problems -- but only if you actually have those problems.

The best architecture is the simplest one that handles your actual complexity. Not the complexity you imagine you might have someday.
