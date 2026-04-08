# Spec: Clean Architecture (Uncle Bob) -- Banking/Money Transfer (Phase 4)

## Overview

Rebuild the same banking domain from Phases 1-3 using Clean Architecture. The behavior is identical -- same five endpoints, same business rules, same API shape. What changes is the introduction of explicit use cases as the unit of application behavior. Each operation (CreateAccount, GetAccount, ListAccounts, InitiateTransfer, GetTransfer) becomes its own use case class with a defined input DTO and output DTO. Controllers map HTTP requests to use-case input. Presenters/mappers convert use-case output to HTTP responses. Every boundary is a data structure, not just a method signature.

**Learning goal**: Experience the moment where you read a use case in isolation and it reads like a specification of what the operation does -- with no mention of HTTP, SQL, or any framework. The interactor pattern makes every operation a named, independently testable unit.

## Slice 1: Project Setup + Entities + Account Creation (end-to-end)

The walking skeleton: a running NestJS app with Clean Architecture layers. The entity layer (innermost) defines the Account with zero dependencies. A CreateAccountUseCase interactor takes a typed input DTO, orchestrates entity creation, and returns a typed output DTO. The controller maps the HTTP request to the use-case input, and a presenter/mapper converts the use-case output to the HTTP response. All wired together, provably working end-to-end.

### Acceptance Criteria

- [x] Running `npm install` and `docker-compose up` in the `clean/` directory starts a working PostgreSQL database
- [x] Running `npm test` executes the Vitest test suite
- [x] The project has distinct layer directories: entities, use-cases, interface-adapters (controllers/presenters), and infrastructure (frameworks/drivers)
- [x] The entities layer contains domain objects with zero imports from any other layer or external library
- [x] The use-cases layer imports only from entities -- never from interface-adapters or infrastructure
- [x] Each use case is its own class -- CreateAccountUseCase is a separate class, not a method on a shared service
- [x] The CreateAccountUseCase defines an explicit input DTO type and an explicit output DTO type
- [x] The use case accepts input, orchestrates entity behavior, calls a repository gateway interface, and returns output -- no HTTP or SQL concepts
- [x] Repository gateway interfaces are declared in the use-cases layer, not in infrastructure
- [x] A user can create an account by sending POST /accounts with an owner name and initial balance
- [x] The created account is returned with an id (UUID), owner, balance, and status of ACTIVE
- [x] Creating an account with a negative initial balance is rejected with an error
- [x] Creating an account without an owner name is rejected with an error
- [x] The account is persisted -- creating it and then retrieving it returns the same data
- [x] The CreateAccountUseCase can be tested by passing an input DTO and asserting on the output DTO -- no HTTP, no database, no framework

### Clean Architecture Notes (for implementer)

- **Entities** (`src/entities/`): Account entity, Transfer entity, domain errors. The innermost circle. Depends on nothing. These are enterprise-wide business rules.
- **Use Cases** (`src/use-cases/`): Each operation is its own class (interactor). Each defines an input DTO and output DTO as plain TypeScript types/interfaces. The use case imports entity types and declares gateway interfaces (repository ports). This is the application-specific business rules layer.
- **Interface Adapters** (`src/interface-adapters/`): Controllers that convert HTTP requests into use-case input DTOs. Presenters/mappers that convert use-case output DTOs into HTTP response shapes. These adapt between the use-case world and the external world.
- **Infrastructure** (`src/infrastructure/`): NestJS framework wiring, Drizzle repository implementations (gateways), database schema. The outermost circle.

**Key structural difference from Onion (Phase 3)**: In Onion, application services were classes with multiple methods (e.g., `AccountService.createAccount()`, `AccountService.getAccount()`). In Clean Architecture, each operation is its own class -- `CreateAccountUseCase`, `GetAccountUseCase`, etc. The use case IS the unit. Additionally, every use case boundary is defined by explicit input/output data structures, not just method signatures.

**Key structural difference from Hexagonal (Phase 2)**: In Hexagonal, the application service coordinated domain logic through ports but the boundary between "what goes in" and "what comes out" was implicit (method parameters and return types). Clean Architecture makes these boundaries explicit DTOs -- the input is a data structure, the output is a data structure, and the use case transforms one to the other.

## Slice 2: Account Retrieval Endpoints

Read use cases for accounts. Each is its own interactor with its own input/output boundary. After this slice, the full account lifecycle (create + read) is complete.

### Acceptance Criteria

- [x] A user can retrieve an account by its id via GET /accounts/:id
- [x] The GetAccountUseCase is a separate class from CreateAccountUseCase -- not a method on the same service
- [x] The GetAccountUseCase defines its own input DTO (account id) and output DTO (account data)
- [x] The response includes the account's id, owner, balance, and status
- [x] Requesting a non-existent account id returns a not-found error
- [x] Requesting an account with an invalid id format returns an error
- [x] A user can list all accounts via GET /accounts
- [x] The ListAccountsUseCase is a separate class with its own input/output DTOs
- [x] When no accounts exist, the list endpoint returns an empty collection
- [x] When multiple accounts exist, all are returned in the list
- [x] Domain errors from use cases are translated to HTTP responses in the interface-adapters layer -- use cases do not reference HTTP concepts

### Clean Architecture Notes (for implementer)

Each read operation follows the same pattern: controller receives HTTP request, maps it to use-case input DTO, invokes the use case, receives the output DTO, and the presenter/mapper converts it to the HTTP response format.

Even for simple reads like GetAccount, the use case boundary is explicit. The input DTO might just be `{ accountId: string }` and the output DTO might be the account data shape -- but naming and typing that boundary is the point. It makes the operation self-documenting and independently testable.

**Contrast with Onion (Phase 3)**: In Onion, `AccountApplicationService` had `getAccount()` and `listAccounts()` methods side by side. Here, `GetAccountUseCase` and `ListAccountsUseCase` are separate classes. This feels like more ceremony for simple reads -- and that is a valid trade-off to notice. The benefit shows up when use cases grow complex: each one can evolve independently.

## Slice 3: Money Transfer with Business Rules

The showcase slice for Clean Architecture. The InitiateTransferUseCase interactor takes a typed input (source, destination, amount), orchestrates entity behavior (insufficient funds check), coordinates persistence through gateway interfaces, and returns a typed output (transfer result). The use case reads like a specification of the transfer operation. Transaction management lives in infrastructure.

### Acceptance Criteria

- [x] A user can initiate a transfer by sending POST /transfers with a source account, destination account, and amount
- [x] A successful transfer debits the source account and credits the destination account by the exact transfer amount
- [x] The transfer is returned with an id, source/destination account references, amount, timestamp, and a status of COMPLETED
- [x] The InitiateTransferUseCase is its own class with an explicit input DTO (source id, destination id, amount) and an explicit output DTO (transfer result)
- [x] Transferring more money than the source account's balance is rejected with an insufficient-funds error
- [x] When a transfer is rejected for insufficient funds, neither account's balance changes
- [x] The transfer record for a rejected transfer has a status of FAILED
- [x] Transferring zero or a negative amount is rejected with an error
- [x] Transferring from a non-existent account returns a not-found error
- [x] Transferring to a non-existent account returns a not-found error
- [x] A transfer is atomic -- if any part of the operation fails mid-way, no account balances are changed
- [x] The InitiateTransferUseCase contains no HTTP concepts and no SQL concepts -- it orchestrates entities and calls gateway interfaces
- [x] The use case can be tested by constructing an input DTO, running the interactor with in-memory gateways, and asserting on the output DTO
- [x] Transaction management (database transaction wrapping) lives in infrastructure -- the use case requests atomicity through a gateway interface

### Clean Architecture Notes (for implementer)

This is where the interactor pattern pays off. The InitiateTransferUseCase should read roughly like:

1. Receive input DTO (fromAccountId, toAccountId, amount)
2. Load source and destination accounts via gateway
3. Check insufficient funds (entity-level rule)
4. Debit source, credit destination (entity behavior)
5. Persist changes via gateway
6. Return output DTO (transfer result)

Each step is visible in the use case. There is no HTTP mapping, no SQL, no transaction syntax. It reads like a specification.

**Contrast with Onion (Phase 3)**: In Onion, the insufficient funds rule lived in a domain service (separate from the application service that orchestrated). In Clean Architecture, the entity itself can enforce its invariants (e.g., Account.debit() throws if insufficient funds), and the use case orchestrates. The domain service layer from Onion collapses -- entities hold business rules, and use cases orchestrate. There is no separate "domain services" ring.

**Contrast with N-tier (Phase 1)**: In N-tier, one service method contained the business rule check, the orchestration logic, and the `db.transaction()` call. Here, the business rule is on the entity, the orchestration is in the use case, and the transaction is in infrastructure -- three separate concerns in three separate places.

| Responsibility | Where it lives in Clean Architecture |
|---|---|
| Insufficient funds rule | Entity (Account.debit throws if balance < amount) |
| Transfer orchestration | Use case (InitiateTransferUseCase interactor) |
| HTTP request/response mapping | Interface adapter (controller + presenter) |
| Transaction atomicity | Infrastructure (gateway implementation wraps in DB transaction) |

## Slice 4: Transfer Retrieval

Read use case for transfers. Completes the full API surface. All five endpoints operational with all five use cases.

### Acceptance Criteria

- [x] A user can retrieve a transfer by its id via GET /transfers/:id
- [x] The GetTransferUseCase is a separate class with its own input/output DTOs
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
- No separate domain services layer -- in Clean Architecture, entities hold business rules and use cases orchestrate (the Onion-style domain service ring is not needed here)

## API Shape (indicative -- identical to Phases 1-3)

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
- **Architecture**: Clean Architecture -- four circles (entities -> use cases -> interface adapters -> infrastructure) with strict inward-only dependency direction and one use case per operation
- **Project location**: `clean/` directory, fully independent with own package.json and docker-compose.yml
- **Testing philosophy**: Behavioral tests. Entities tested in pure isolation (zero dependencies). Use cases tested by passing input DTOs and asserting output DTOs with in-memory gateway implementations. Integration tests use full HTTP round-trips against a real database. No mocking implementation details.
- **Risk level**: LOW
- **Patterns to follow**: NestJS modules for dependency injection wiring in infrastructure. Drizzle for schema and queries (infrastructure only). Vitest for all tests. One class per use case. Explicit input/output DTOs at every use-case boundary.

## Key Contrast: N-tier vs Hexagonal vs Onion vs Clean

| Concern | N-tier (Phase 1) | Hexagonal (Phase 2) | Onion (Phase 3) | Clean (Phase 4) |
|---|---|---|---|---|
| Unit of application behavior | Service method | Application service method | Application service method | Use case class (one per operation) |
| Business rules location | Service layer (imports NestJS exceptions) | Domain core (no framework imports) | Domain services layer (separate from orchestration) | Entities (innermost circle, enforce own invariants) |
| Orchestration location | Same service that has business rules | Application service (somewhat blurred with domain) | Application services (explicitly separate from domain services) | Use case interactor (separate class per operation) |
| Boundary definition | Method parameters and return types | Port interfaces with method signatures | Interface method signatures | Explicit input DTO and output DTO per use case |
| Number of "Account" operations classes | 1 (AccountService) | 1 (AccountApplicationService) | 1 (AccountApplicationService) | 3 (CreateAccountUseCase, GetAccountUseCase, ListAccountsUseCase) |
| HTTP-to-domain mapping | Controller passes raw data to service | Controller calls application service directly | Controller calls application service directly | Controller maps request to input DTO; presenter maps output DTO to response |
| Repository dependency | Service imports concrete repository | Application service depends on port interface | Application service depends on interface in inner layer | Use case depends on gateway interface declared in use-cases layer |
| Transaction management | Service calls `db.transaction()` directly | Adapter handles through port | Infrastructure handles through interface | Infrastructure gateway wraps in transaction |
| Testability of operations | Needs service + mocked repository | Domain tested with in-memory adapters | Domain services tested with plain objects; app services with in-memory repos | Use case tested with input DTO -> output DTO + in-memory gateways |
| What separates this from the previous | Baseline | Dependency inversion + ports | Explicit layers + domain/app service split | One use case per operation + explicit input/output DTOs at every boundary |

## Aha-Moment Checkpoint

After completing this phase, try these experiments:

1. **Read a use case in isolation.** Open `InitiateTransferUseCase` and read it top to bottom. It should read like a specification: "take these inputs, load these entities, check this rule, update these balances, persist, return this result." No HTTP. No SQL. No framework. This is the Clean Architecture payoff.
2. **Compare the use case count to Onion.** In Onion, one application service had three methods for accounts. Here, there are three separate use-case classes. Notice how each use case can evolve, be tested, and be reasoned about independently. Also notice the extra ceremony -- more files, more boilerplate. That is the trade-off.
3. **Look at the input/output DTOs.** In prior phases, the boundary between "what goes in" and "what comes out" was a method signature. Here, it is an explicit data structure. This makes the contract visible and versionable -- you could change the output shape of one use case without touching any other.
4. **Try adding a new operation.** Imagine adding "CloseAccount." In Onion, you would add a method to the application service. Here, you would create a new `CloseAccountUseCase` class with its own input/output DTOs. Notice how neither approach touches existing code -- but Clean Architecture makes the new operation a completely self-contained unit.

[ ] Reviewed
