# Spec: N-tier Architecture -- Banking/Money Transfer (Phase 1)

## Overview

Build the simplest possible banking application using N-tier architecture (Controller -> Service -> Repository). This is the baseline implementation against which all subsequent architecture patterns will be compared. Same domain, same API, same business rules -- the only variable is code organization.

## Slice 1: Project Setup + Account Creation

The walking skeleton: a running NestJS app with a real database that can create an account end-to-end.

### Acceptance Criteria

- [x] Running `npm install` and `docker-compose up` in the `n-tier/` directory starts a working PostgreSQL database
- [x] Running `npm test` executes the Vitest test suite
- [x] A user can create an account by sending POST /accounts with an owner name and initial balance
- [x] The created account is returned with an id (UUID), owner, balance, and status of ACTIVE
- [x] Creating an account with a negative initial balance is rejected with an error
- [x] Creating an account without an owner name is rejected with an error
- [x] The account is persisted -- creating it and then fetching it from the database returns the same data

### Technical Context

- NestJS project with TypeScript, Drizzle ORM, PostgreSQL, Vitest
- N-tier structure: Controller handles HTTP, Service contains business logic, Repository handles data access
- No abstractions or interfaces -- direct concrete dependencies between layers
- Drizzle schema defines Account table (id UUID, owner string, balance number, status enum)
- Integration test: full HTTP round-trip (POST /accounts -> verify response)
- Behavioral unit test: account creation logic (valid inputs produce account, invalid inputs produce errors)

## Slice 2: Get Account + List Accounts

Read endpoints for accounts. After this slice, the full account lifecycle (create + read) is complete.

### Acceptance Criteria

- [x] A user can retrieve an account by its id via GET /accounts/:id
- [x] The response includes the account's id, owner, balance, and status
- [x] Requesting a non-existent account id returns a not-found error
- [x] Requesting an account with an invalid id format returns an error
- [x] A user can list all accounts via GET /accounts
- [x] When no accounts exist, the list endpoint returns an empty collection
- [x] When multiple accounts exist, all are returned in the list

## Slice 3: Money Transfer with Business Rules

The core domain behavior: transferring money between accounts with insufficient funds protection and atomicity.

### Acceptance Criteria

- [x] A user can initiate a transfer by sending POST /transfers with a source account, destination account, and amount
- [x] A successful transfer debits the source account and credits the destination account by the exact transfer amount
- [x] The transfer is returned with an id, source/destination account references, amount, timestamp, and a status of COMPLETED
- [x] Transferring more money than the source account's balance is rejected with an insufficient-funds error
- [x] When a transfer is rejected for insufficient funds, neither account's balance changes
- [x] The transfer record for a rejected transfer has a status of FAILED
- [x] Transferring zero or a negative amount is rejected with an error
- [x] Transferring from a non-existent account returns a not-found error
- [x] Transferring to a non-existent account returns a not-found error
- [x] A transfer is atomic -- if any part of the operation fails mid-way, no account balances are changed (no partial transfers)

### Technical Context

- Transfer atomicity is enforced via a database transaction wrapping the debit + credit + transfer record creation
- The insufficient funds check and the balance debit must happen inside the same transaction to prevent race conditions
- This is where the N-tier "service does everything" pattern becomes most visible: the service method orchestrates validation, business rules, and transaction management all in one place

## Slice 4: Get Transfer

Read endpoint for transfers. Completes the full API surface.

### Acceptance Criteria

- [x] A user can retrieve a transfer by its id via GET /transfers/:id
- [x] The response includes the transfer's id, source account, destination account, amount, timestamp, and status
- [x] Requesting a non-existent transfer id returns a not-found error
- [x] Requesting a transfer with an invalid id format returns an error

## Out of Scope

- No authentication or authorization
- No pagination, filtering, or sorting on list endpoints
- No account closure or status transitions beyond initial ACTIVE
- No transfer history per account (list all transfers for a given account)
- No currency handling -- all amounts are plain numbers
- No rate limiting or request validation beyond basic field presence/type
- No CI/CD pipeline
- No shared test infrastructure with other architecture phases

## API Shape (indicative)

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
- **Architecture**: Controller -> Service -> Repository, no abstractions
- **Project location**: `n-tier/` directory, fully independent with own package.json and docker-compose.yml
- **Testing philosophy**: Behavioral tests only. A "unit" is a group of behaviors, not a class. Tests survive internal refactoring. No mocking implementation details.
- **Risk level**: LOW (learning exercise, simplest architecture pattern)
- **Patterns to follow**: NestJS conventions (modules, controllers, services, injectable providers). Drizzle for schema definition and queries. Vitest for all tests.

[x] Reviewed
