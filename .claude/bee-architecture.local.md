## DDD Tactical Patterns Implementation — Phase 5

### Pattern
DDD Tactical Patterns — three-layer structure (domain / application / infrastructure) with rich domain model: aggregates, value objects, domain events.

### Three Layers
1. **Domain** (innermost): Aggregates, value objects, domain events, errors, repository interfaces. ZERO external dependencies.
2. **Application**: Thin orchestration services. Load aggregates, invoke methods, persist, dispatch events.
3. **Infrastructure** (outermost): NestJS controllers, Drizzle repos, framework wiring.

### Folder Structure
```
ddd/src/
  domain/
    value-objects/
      account-id.ts
      money.ts
      transfer-id.ts
    aggregates/
      account.ts
      transfer.ts
    events/
      domain-event.ts
      transfer-completed.ts
      transfer-failed.ts
    errors/
      domain-errors.ts
    repositories/
      account-repository.interface.ts
      transfer-repository.interface.ts
      unit-of-work.interface.ts
  application/
    account.service.ts
    transfer.service.ts
  infrastructure/
    rest/
      account.controller.ts
      transfer.controller.ts
      error-filter.ts
    persistence/drizzle/
      schema.ts
      drizzle.provider.ts
      account-repository.ts
      transfer-repository.ts
      unit-of-work.ts
      migrations/
    app.module.ts
    main.ts
```

### Value Objects
- AccountId: wraps UUID, validates format, value equality
- Money: wraps number, rejects negative, immutable add/subtract returning new Money
- TransferId: wraps UUID, validates format, value equality
- Plain TypeScript classes, constructor validates, all fields readonly

### Aggregates
- Account: takes AccountId, Money, owner, status. debit(Money) checks balance, credit(Money) adds. No setBalance().
- Transfer: holds events as private array, exposes via domainEvents getter

### Domain Events
- TransferCompleted, TransferFailed: plain TypeScript types
- Created during operation, collected, stored in DB after transaction commits
- No external event bus

### Repositories
- Interfaces in domain/repositories/
- Implementations decompose aggregates to DB rows, reconstitute full aggregates with value objects

### Testing Strategy
- Value objects: pure unit tests, zero deps
- Aggregates: unit tests with value objects only
- Application services: unit tests with in-memory repos
- Integration: full HTTP round-trip with real PostgreSQL

### Docker Compose
PostgreSQL 16 Alpine, DB: ddd_bank, User: ddd, Password: ddd_local, Port: 5436

### Slice Order
Confirmed: Setup+ValueObjects+Create -> Read -> Transfer+Events -> GetTransfer+Events
