import { describe, it, expect, beforeEach } from 'vitest';
import { InitiateTransferUseCase } from '../../src/use-cases/initiate-transfer/initiate-transfer.use-case';
import { InitiateTransferInput } from '../../src/use-cases/initiate-transfer/initiate-transfer.input';
import { InMemoryAccountGateway } from '../in-memory-account-gateway';
import { InMemoryTransferGateway } from '../in-memory-transfer-gateway';
import { InMemoryUnitOfWork } from '../in-memory-unit-of-work';
import { Account } from '../../src/entities/account';
import {
  AccountNotFoundError,
  InsufficientFundsError,
  InvalidAmountError,
  InvalidIdError,
} from '../../src/entities/errors';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SOURCE_ID = '550e8400-e29b-41d4-a716-446655440001';
const DEST_ID = '550e8400-e29b-41d4-a716-446655440002';

let accountGateway: InMemoryAccountGateway;
let transferGateway: InMemoryTransferGateway;
let unitOfWork: InMemoryUnitOfWork;
let useCase: InitiateTransferUseCase;

function buildInput(overrides: Partial<InitiateTransferInput> = {}): InitiateTransferInput {
  return {
    fromAccountId: SOURCE_ID,
    toAccountId: DEST_ID,
    amount: 50,
    ...overrides,
  };
}

async function seedAccount(id: string, owner: string, balance: number): Promise<Account> {
  return accountGateway.save(new Account(id, owner, balance, 'ACTIVE'));
}

describe('InitiateTransferUseCase', () => {
  beforeEach(() => {
    accountGateway = new InMemoryAccountGateway();
    transferGateway = new InMemoryTransferGateway();
    unitOfWork = new InMemoryUnitOfWork(accountGateway, transferGateway);
    useCase = new InitiateTransferUseCase(accountGateway, transferGateway, unitOfWork);
  });

  describe('successful transfer', () => {
    it('debits source and credits destination by exact amount', async () => {
      await seedAccount(SOURCE_ID, 'Alice', 200);
      await seedAccount(DEST_ID, 'Bob', 100);

      await useCase.execute(buildInput({ amount: 75 }));

      const source = await accountGateway.findById(SOURCE_ID);
      const dest = await accountGateway.findById(DEST_ID);
      expect(source!.balance).toBe(125);
      expect(dest!.balance).toBe(175);
    });

    it('returns output with id, source, destination, amount, timestamp, and COMPLETED status', async () => {
      await seedAccount(SOURCE_ID, 'Alice', 200);
      await seedAccount(DEST_ID, 'Bob', 100);

      const output = await useCase.execute(buildInput({ amount: 50 }));

      expect(output.id).toMatch(UUID_PATTERN);
      expect(output.fromAccountId).toBe(SOURCE_ID);
      expect(output.toAccountId).toBe(DEST_ID);
      expect(output.amount).toBe(50);
      expect(output.timestamp).toBeInstanceOf(Date);
      expect(output.status).toBe('COMPLETED');
    });

    it('persists the transfer record through the gateway', async () => {
      await seedAccount(SOURCE_ID, 'Alice', 200);
      await seedAccount(DEST_ID, 'Bob', 100);

      const output = await useCase.execute(buildInput({ amount: 30 }));

      const persisted = await transferGateway.findById(output.id);
      expect(persisted).toBeDefined();
      expect(persisted!.fromAccountId).toBe(SOURCE_ID);
      expect(persisted!.toAccountId).toBe(DEST_ID);
      expect(persisted!.amount).toBe(30);
      expect(persisted!.status).toBe('COMPLETED');
    });
  });

  describe('insufficient funds', () => {
    it('rejects when source balance is less than transfer amount', async () => {
      await seedAccount(SOURCE_ID, 'Alice', 30);
      await seedAccount(DEST_ID, 'Bob', 100);

      await expect(
        useCase.execute(buildInput({ amount: 50 })),
      ).rejects.toThrow(InsufficientFundsError);
    });

    it('does not change either account balance on rejection', async () => {
      await seedAccount(SOURCE_ID, 'Alice', 30);
      await seedAccount(DEST_ID, 'Bob', 100);

      try {
        await useCase.execute(buildInput({ amount: 50 }));
      } catch {
        // expected
      }

      const source = await accountGateway.findById(SOURCE_ID);
      const dest = await accountGateway.findById(DEST_ID);
      expect(source!.balance).toBe(30);
      expect(dest!.balance).toBe(100);
    });

    it('persists a transfer with FAILED status', async () => {
      await seedAccount(SOURCE_ID, 'Alice', 30);
      await seedAccount(DEST_ID, 'Bob', 100);

      try {
        await useCase.execute(buildInput({ amount: 50 }));
      } catch {
        // expected
      }

      const allTransfers = transferGateway.findAll();
      expect(allTransfers).toHaveLength(1);
      expect(allTransfers[0].status).toBe('FAILED');
      expect(allTransfers[0].fromAccountId).toBe(SOURCE_ID);
      expect(allTransfers[0].toAccountId).toBe(DEST_ID);
      expect(allTransfers[0].amount).toBe(50);
    });
  });

  describe('invalid amount', () => {
    it('rejects zero amount', async () => {
      await seedAccount(SOURCE_ID, 'Alice', 200);
      await seedAccount(DEST_ID, 'Bob', 100);

      await expect(
        useCase.execute(buildInput({ amount: 0 })),
      ).rejects.toThrow(InvalidAmountError);
    });

    it('rejects negative amount', async () => {
      await seedAccount(SOURCE_ID, 'Alice', 200);
      await seedAccount(DEST_ID, 'Bob', 100);

      await expect(
        useCase.execute(buildInput({ amount: -10 })),
      ).rejects.toThrow(InvalidAmountError);
    });
  });

  describe('non-existent accounts', () => {
    it('rejects when source account does not exist', async () => {
      await seedAccount(DEST_ID, 'Bob', 100);

      await expect(
        useCase.execute(buildInput()),
      ).rejects.toThrow(AccountNotFoundError);
    });

    it('rejects when destination account does not exist', async () => {
      await seedAccount(SOURCE_ID, 'Alice', 200);

      await expect(
        useCase.execute(buildInput()),
      ).rejects.toThrow(AccountNotFoundError);
    });
  });

  describe('invalid id format', () => {
    it('rejects non-UUID source account id', async () => {
      await expect(
        useCase.execute(buildInput({ fromAccountId: 'not-a-uuid' })),
      ).rejects.toThrow(InvalidIdError);
    });

    it('rejects non-UUID destination account id', async () => {
      await expect(
        useCase.execute(buildInput({ toAccountId: 'not-a-uuid' })),
      ).rejects.toThrow(InvalidIdError);
    });
  });

  describe('use case purity', () => {
    it('accepts explicit input DTO and returns explicit output DTO without HTTP or SQL concepts', async () => {
      await seedAccount(SOURCE_ID, 'Alice', 500);
      await seedAccount(DEST_ID, 'Bob', 200);

      const input: InitiateTransferInput = {
        fromAccountId: SOURCE_ID,
        toAccountId: DEST_ID,
        amount: 100,
      };

      const output = await useCase.execute(input);

      expect(output.id).toMatch(UUID_PATTERN);
      expect(output.fromAccountId).toBe(SOURCE_ID);
      expect(output.toAccountId).toBe(DEST_ID);
      expect(output.amount).toBe(100);
      expect(output.status).toBe('COMPLETED');
      expect(output.timestamp).toBeInstanceOf(Date);
    });
  });
});
