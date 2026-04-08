## Onion Architecture Implementation — Phase 3

### Pattern
Onion Architecture — four concentric rings with strict inward-only dependency direction.

### Four Layers
1. **Domain Model** (Ring 1, innermost): Entities, errors, types. ZERO dependencies.
2. **Domain Services** (Ring 2): Pure business logic + repository interfaces. Depends only on Ring 1.
3. **Application Services** (Ring 3): Orchestration only. Depends on Ring 1 + Ring 2.
4. **Infrastructure** (Ring 4, outermost): NestJS, Drizzle, HTTP. Depends on everything inward.

### Folder Structure
```
onion/src/
  domain/
    model/                           # RING 1 — zero dependencies
      account.ts                     # Account interface + factory
      transfer.ts                    # Transfer interface + factory
      errors.ts                      # All domain error classes
    services/                        # RING 2 — depends only on domain/model
      transfer-domain.service.ts     # Pure business logic: insufficient funds check
      account-repository.interface.ts
      transfer-repository.interface.ts
      unit-of-work.interface.ts
  application/                       # RING 3 — depends on domain/model + domain/services
    account.service.ts               # Orchestrates account creation/retrieval
    transfer.service.ts              # Orchestrates transfer workflow
  infrastructure/                    # RING 4 — outermost, depends on everything inner
    persistence/drizzle/
      schema.ts
      drizzle.provider.ts
      account-repository.ts
      transfer-repository.ts
      unit-of-work.ts
    rest/
      account.controller.ts
      transfer.controller.ts
      error-filter.ts
    app.module.ts
    main.ts
```

### The KEY Split: Domain Service vs Application Service
**Domain Service** (`transfer-domain.service.ts`, Ring 2):
- Pure function-like: takes domain objects in, returns results out
- `executeTransfer(source, destination, amount)` → `{ debitedSource, creditedDestination, transfer }` or throws InsufficientFundsError
- Zero I/O, no repository calls, no NestJS decorators
- Testable with plain object construction

**Application Service** (`transfer.service.ts`, Ring 3):
- Orchestration script: validate IDs → load accounts → call domain service → persist results
- Uses repository interfaces from Ring 2
- Uses UnitOfWork interface for atomicity
- NO business rules here — just workflow coordination

### Repository Interfaces
- Declared in `domain/services/` (Ring 2), NOT in Ring 1
- Ring 1 stays absolutely pure — no interfaces, no tokens
- Application service (Ring 3) imports from Ring 2
- Infrastructure (Ring 4) implements them

### Transaction Handling
- Same UnitOfWork pattern as Hexagonal
- Interface in `domain/services/unit-of-work.interface.ts` (Ring 2)
- Application service calls `unitOfWork.execute(...)` (Ring 3)
- Drizzle adapter implements with `db.transaction()` (Ring 4)

### Testing Strategy
| Layer | How to test | Dependencies |
|-------|------------|-------------|
| Domain Model (Ring 1) | Pure unit tests | Zero. Construct objects, assert. |
| Domain Services (Ring 2) | Unit tests with plain objects | Create Account/Transfer by hand. No mocks. |
| Application Services (Ring 3) | Unit tests with in-memory repos | Simple in-memory implementations. |
| Infrastructure (Ring 4) | Integration tests | Full HTTP + real PostgreSQL. |

### Docker Compose
- PostgreSQL 16 Alpine
- DB: `onion_bank`, User: `onion`, Password: `onion_local`
- Port: 5434 (different from N-tier 5432 and Hexagonal 5433)

### Key Difference from Hexagonal
- Hexagonal: single `domain/` layer with models + ports together
- Onion: domain split into `model/` (Ring 1) and `services/` (Ring 2) with enforced boundary
- Hexagonal: business logic mixed with orchestration in application service
- Onion: business logic in domain service, orchestration in application service — structurally separated

### Slice Order
Confirmed as-is: Setup+Domain+Create → Read → Transfer → Get Transfer
