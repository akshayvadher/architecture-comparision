## Hexagonal Architecture Implementation — Phase 2

### Pattern
Hexagonal (Ports & Adapters). Domain core has ZERO infrastructure imports. Dependencies point inward.

### Folder Structure
```
hexagonal/src/
  domain/                          # THE CORE — zero infrastructure imports
    models/
      account.ts                   # Account entity with business rules
      transfer.ts                  # Transfer entity
    ports/
      account-repository.port.ts   # Interface: what the domain needs from persistence
      transfer-repository.port.ts  # Interface: what the domain needs from persistence
      unit-of-work.port.ts         # Interface: "run these operations atomically"
    errors/
      domain-errors.ts             # InsufficientFundsError, AccountNotFoundError, etc.

  application/                     # Orchestration — depends on domain, not on adapters
    account.service.ts             # Orchestrates account creation/retrieval through ports
    transfer.service.ts            # Orchestrates transfers through ports (uses UnitOfWork)

  adapters/
    driving/rest/                  # Inbound — pushes requests INTO the application
      account.controller.ts
      transfer.controller.ts
      error-filter.ts              # Maps domain errors to HTTP status codes
    driven/persistence/drizzle/    # Outbound — implements ports the domain declares
      schema.ts
      account-repository.adapter.ts
      transfer-repository.adapter.ts
      unit-of-work.adapter.ts      # Implements UnitOfWork with db.transaction()
      drizzle.provider.ts

  infrastructure/
    app.module.ts                  # NestJS wiring — binds port tokens to adapters
    main.ts
```

### Transaction Handling — Unit of Work Port
- Domain declares `UnitOfWork` port: `execute<T>(work: (repos) => Promise<T>): Promise<T>`
- Application service calls `this.unitOfWork.execute(async ({ accounts, transfers }) => { ... })`
- Drizzle adapter implements with `db.transaction()`, creating transactional repo instances
- In-memory test adapter just runs the callback directly
- Domain says "run this atomically" without knowing HOW

### NestJS DI Wiring
- String tokens: `ACCOUNT_REPOSITORY`, `TRANSFER_REPOSITORY`, `UNIT_OF_WORK`
- Module providers: `{ provide: TOKEN, useClass: DrizzleAdapter }`
- Application services use `@Inject(TOKEN)` to receive port implementations
- Application layer imports `@Inject` (DI glue) — acceptable
- Domain layer imports NOTHING from NestJS

### Error Handling
- Domain throws domain-specific errors (InsufficientFundsError, AccountNotFoundError, InvalidAmountError)
- Driving adapter has error filter that maps domain errors → HTTP status codes
- Domain never mentions HTTP

### Testing Strategy
- **Domain tests (in-memory adapters, no DB)**: In-memory implementations of all ports. Fast, no Docker needed. Test all business rules.
- **Integration tests (real DB, full HTTP)**: supertest + real PostgreSQL via docker-compose
- **In-memory adapters**: Simple Map/Array backed implementations of port interfaces

### Docker Compose
- PostgreSQL 16 Alpine
- DB: `hexagonal_bank`, User: `hexagonal`, Password: `hexagonal_local`
- Port: 5433 (different from N-tier's 5432)

### Dependency Direction
```
Driving Adapters (REST) --> Application Services --> Domain Core (entities, ports, errors)
                                                         ^
Driven Adapters (Drizzle) ---implements ports of---------/
```

### Key Contrasts with N-tier
| Concern | N-tier | Hexagonal |
|---------|--------|-----------|
| Business rules | Service layer (imports NestJS) | Domain core (no imports) |
| Repository | Concrete class dependency | Port interface + adapter |
| Transactions | Service calls db.transaction() | UnitOfWork port, adapter handles |
| Errors | NestJS exceptions | Domain errors, adapter maps to HTTP |
| Testability | Needs real DB | In-memory adapters, no DB needed |

### Slice Order
Confirmed as-is: Setup+Domain+Create → Read → Transfer → Get Transfer
