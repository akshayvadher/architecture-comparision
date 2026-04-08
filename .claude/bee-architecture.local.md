## N-tier Architecture Implementation — Phase 1

### Pattern
N-tier (Controller → Service → Repository). No interfaces, no dependency inversion. Direct concrete dependencies.

### Folder Structure
```
n-tier/
  docker-compose.yml
  package.json
  tsconfig.json
  vitest.config.ts
  drizzle.config.ts
  src/
    main.ts
    app.module.ts
    database/
      database.module.ts
      drizzle.provider.ts
      schema.ts
      migrations/
    accounts/
      accounts.module.ts
      accounts.controller.ts
      accounts.service.ts
      accounts.repository.ts
    transfers/
      transfers.module.ts
      transfers.controller.ts
      transfers.service.ts
      transfers.repository.ts
  test/
    setup.ts
    accounts/
      account-creation.test.ts
      account-retrieval.test.ts
      accounts.integration.test.ts
    transfers/
      transfer-execution.test.ts
      transfer-retrieval.test.ts
      transfers.integration.test.ts
```

### NestJS Modules
- `DatabaseModule` (global) — exports Drizzle instance
- `AccountsModule` — controller, service, repository
- `TransfersModule` — imports AccountsModule

### Drizzle Setup
- Single `src/database/schema.ts` for both tables
- `drizzle.provider.ts` creates instance via `pg` package, `DATABASE_URL` env var
- `drizzle-kit` for migrations

### Testing Strategy
- **Behavioral unit tests**: Test behavior groups (creation behaviors, transfer behaviors). Real service + real repository + test database. NO mocks.
- **Integration tests**: Full HTTP round-trip via NestJS testing + supertest
- **Test DB**: Same Postgres, separate database (`ntier_bank_test`). `test/setup.ts` handles migrations + table truncation between tests.
- **Vitest config**: Two projects — `unit` and `integration`. Both hit real DB.

### Transaction Handling
- Service owns the transaction (the N-tier characteristic)
- Drizzle `db.transaction(async (tx) => {...})` wraps debit + credit + transfer record
- `SELECT ... FOR UPDATE` locks both accounts to prevent race conditions
- Repository methods accept optional `tx` parameter
- If any step throws, entire transaction rolls back

### Docker Compose
- PostgreSQL 16 Alpine
- DB: `ntier_bank`, User: `ntier`, Password: `ntier_local`
- Port 5432
- Test uses same instance, different database

### Slice Order
Confirmed as-is: Setup+Create → Read → Transfer → Get Transfer

### Key N-tier Characteristics
- Service layer does EVERYTHING: validation, business rules, transaction management
- No abstractions — controller calls service directly, service calls repository directly
- Repository methods are thin data access wrappers around Drizzle queries
