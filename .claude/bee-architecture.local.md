## Clean Architecture Implementation — Phase 4

### Pattern
Clean Architecture (Uncle Bob) — four concentric circles with strict inward-only dependency direction, one use case class per operation, explicit input/output DTOs at every use case boundary.

### Four Circles
1. **Entities** (Circle 1, innermost): Account, Transfer, domain errors. Entities hold their own business rules. ZERO dependencies.
2. **Use Cases** (Circle 2): One class per operation. Each has explicit input/output DTOs. Gateway interfaces declared here.
3. **Interface Adapters** (Circle 3): Controllers (HTTP to input DTO), Presenters (output DTO to HTTP response), Error filter.
4. **Infrastructure** (Circle 4, outermost): NestJS wiring, Drizzle repos, DB schema.

### Folder Structure
```
clean/src/
  entities/
    account.ts
    transfer.ts
    errors.ts
  use-cases/
    create-account/
      create-account.use-case.ts
      create-account.input.ts
      create-account.output.ts
    get-account/
      get-account.use-case.ts
      get-account.input.ts
      get-account.output.ts
    list-accounts/
      list-accounts.use-case.ts
      list-accounts.input.ts
      list-accounts.output.ts
    initiate-transfer/
      initiate-transfer.use-case.ts
      initiate-transfer.input.ts
      initiate-transfer.output.ts
    get-transfer/
      get-transfer.use-case.ts
      get-transfer.input.ts
      get-transfer.output.ts
    gateways/
      account.gateway.ts
      transfer.gateway.ts
      unit-of-work.gateway.ts
  interface-adapters/
    controllers/
      account.controller.ts
      transfer.controller.ts
    presenters/
      account.presenter.ts
      transfer.presenter.ts
    error-filter.ts
  infrastructure/
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

### Entity Design
Account class with debit()/credit() methods. Constructor validates owner and balance. debit() throws InsufficientFundsError. This collapses Onion Ring 2 (domain services).

### Use Case Pattern
constructor(gateway) + execute(input): Promise<output>
Input/Output DTOs are plain TypeScript types. Gateway interfaces from use-cases/gateways/.

### Testing Strategy
- Entities: Pure unit tests, zero dependencies
- Use Cases: Input DTO in, assert output DTO, in-memory gateways
- Integration: Full HTTP round-trip with real PostgreSQL

### Docker Compose
PostgreSQL 16 Alpine, DB: clean_bank, User: clean, Password: clean_local, Port: 5435

### Slice Order
Setup+Create -> Read -> Transfer -> Get Transfer
