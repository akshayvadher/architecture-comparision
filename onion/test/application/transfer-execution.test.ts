import { describe, it, expect } from 'vitest';
import { TransferService } from '../../src/application/transfer.service';
import { InMemoryAccountRepository } from '../in-memory-account-repository';
import { InMemoryTransferRepository } from '../in-memory-transfer-repository';
import { InMemoryUnitOfWork } from '../in-memory-unit-of-work';
import {
  AccountNotFoundError,
  InsufficientFundsError,
  InvalidAmountError,
  InvalidIdError,
} from '../../src/domain/model/errors';
import { Account } from '../../src/domain/model/account';

const ALICE_ID = '11111111-1111-1111-1111-111111111111';
const BOB_ID = '22222222-2222-2222-2222-222222222222';
const NON_EXISTENT_ID = '99999999-9999-9999-9999-999999999999';

function buildService() {
  const accountRepo = new InMemoryAccountRepository();
  const transferRepo = new InMemoryTransferRepository();
  const unitOfWork = new InMemoryUnitOfWork(accountRepo, transferRepo);
  const service = new TransferService(unitOfWork, transferRepo, accountRepo);
  return { service, accountRepo, transferRepo };
}

async function seedAccount(
  repo: InMemoryAccountRepository,
  overrides: Partial<Account> = {},
): Promise<Account> {
  const account: Account = {
    id: ALICE_ID,
    owner: 'Alice',
    balance: 500,
    status: 'ACTIVE',
    ...overrides,
  };
  return repo.save(account);
}

describe('TransferService — transfer execution', () => {
  it('debits source and credits destination by the transfer amount', async () => {
    const { service, accountRepo } = buildService();
    await seedAccount(accountRepo, { id: ALICE_ID, owner: 'Alice', balance: 500 });
    await seedAccount(accountRepo, { id: BOB_ID, owner: 'Bob', balance: 200 });

    await service.executeTransfer(ALICE_ID, BOB_ID, 150);

    const alice = await accountRepo.findById(ALICE_ID);
    const bob = await accountRepo.findById(BOB_ID);
    expect(alice!.balance).toBe(350);
    expect(bob!.balance).toBe(350);
  });

  it('returns a COMPLETED transfer with all expected fields', async () => {
    const { service, accountRepo } = buildService();
    await seedAccount(accountRepo, { id: ALICE_ID, balance: 500 });
    await seedAccount(accountRepo, { id: BOB_ID, balance: 200 });

    const transfer = await service.executeTransfer(ALICE_ID, BOB_ID, 100);

    expect(transfer).toMatchObject({
      fromAccountId: ALICE_ID,
      toAccountId: BOB_ID,
      amount: 100,
      status: 'COMPLETED',
    });
    expect(transfer.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(transfer.timestamp).toBeInstanceOf(Date);
  });

  it('persists the transfer so it can be retrieved by id', async () => {
    const { service, accountRepo } = buildService();
    await seedAccount(accountRepo, { id: ALICE_ID, balance: 500 });
    await seedAccount(accountRepo, { id: BOB_ID, balance: 200 });

    const created = await service.executeTransfer(ALICE_ID, BOB_ID, 100);
    const retrieved = await service.getTransferById(created.id);

    expect(retrieved.id).toBe(created.id);
    expect(retrieved.status).toBe('COMPLETED');
  });

  it('rejects insufficient funds with InsufficientFundsError', async () => {
    const { service, accountRepo } = buildService();
    await seedAccount(accountRepo, { id: ALICE_ID, balance: 50 });
    await seedAccount(accountRepo, { id: BOB_ID, balance: 200 });

    await expect(
      service.executeTransfer(ALICE_ID, BOB_ID, 100),
    ).rejects.toThrow(InsufficientFundsError);
  });

  it('does not change either balance when transfer is rejected for insufficient funds', async () => {
    const { service, accountRepo } = buildService();
    await seedAccount(accountRepo, { id: ALICE_ID, balance: 50 });
    await seedAccount(accountRepo, { id: BOB_ID, balance: 200 });

    try {
      await service.executeTransfer(ALICE_ID, BOB_ID, 100);
    } catch {
      // expected
    }

    const alice = await accountRepo.findById(ALICE_ID);
    const bob = await accountRepo.findById(BOB_ID);
    expect(alice!.balance).toBe(50);
    expect(bob!.balance).toBe(200);
  });

  it('saves a FAILED transfer record when insufficient funds', async () => {
    const { service, accountRepo, transferRepo } = buildService();
    await seedAccount(accountRepo, { id: ALICE_ID, balance: 50 });
    await seedAccount(accountRepo, { id: BOB_ID, balance: 200 });

    let thrownError: Error | undefined;
    try {
      await service.executeTransfer(ALICE_ID, BOB_ID, 100);
    } catch (error) {
      thrownError = error as Error;
    }

    expect(thrownError).toBeInstanceOf(InsufficientFundsError);

    // The transfer repo's internal map should have one FAILED entry.
    // Access via the repo's findById — we need to find the saved transfer id.
    // Since the repo stores by id, we check the internal map size via a known pattern:
    // The service generates a UUID, so we access the repo's private map for verification.
    const repoMap = (transferRepo as any).transfers as Map<string, any>;
    expect(repoMap.size).toBe(1);
    const savedTransfer = Array.from(repoMap.values())[0];
    expect(savedTransfer.status).toBe('FAILED');
    expect(savedTransfer.fromAccountId).toBe(ALICE_ID);
    expect(savedTransfer.toAccountId).toBe(BOB_ID);
    expect(savedTransfer.amount).toBe(100);
  });

  it('rejects zero amount with InvalidAmountError', async () => {
    const { service, accountRepo } = buildService();
    await seedAccount(accountRepo, { id: ALICE_ID, balance: 500 });
    await seedAccount(accountRepo, { id: BOB_ID, balance: 200 });

    await expect(
      service.executeTransfer(ALICE_ID, BOB_ID, 0),
    ).rejects.toThrow(InvalidAmountError);
  });

  it('rejects negative amount with InvalidAmountError', async () => {
    const { service, accountRepo } = buildService();
    await seedAccount(accountRepo, { id: ALICE_ID, balance: 500 });
    await seedAccount(accountRepo, { id: BOB_ID, balance: 200 });

    await expect(
      service.executeTransfer(ALICE_ID, BOB_ID, -50),
    ).rejects.toThrow(InvalidAmountError);
  });

  it('rejects transfer from a non-existent source account', async () => {
    const { service, accountRepo } = buildService();
    await seedAccount(accountRepo, { id: BOB_ID, balance: 200 });

    await expect(
      service.executeTransfer(NON_EXISTENT_ID, BOB_ID, 100),
    ).rejects.toThrow(AccountNotFoundError);
  });

  it('rejects transfer to a non-existent destination account', async () => {
    const { service, accountRepo } = buildService();
    await seedAccount(accountRepo, { id: ALICE_ID, balance: 500 });

    await expect(
      service.executeTransfer(ALICE_ID, NON_EXISTENT_ID, 100),
    ).rejects.toThrow(AccountNotFoundError);
  });

  it('rejects transfer with invalid source account id format', async () => {
    const { service } = buildService();

    await expect(
      service.executeTransfer('not-a-uuid', BOB_ID, 100),
    ).rejects.toThrow(InvalidIdError);
  });

  it('rejects transfer with invalid destination account id format', async () => {
    const { service } = buildService();

    await expect(
      service.executeTransfer(ALICE_ID, 'not-a-uuid', 100),
    ).rejects.toThrow(InvalidIdError);
  });

  it('does not change balances when amount validation fails', async () => {
    const { service, accountRepo } = buildService();
    await seedAccount(accountRepo, { id: ALICE_ID, balance: 500 });
    await seedAccount(accountRepo, { id: BOB_ID, balance: 200 });

    try {
      await service.executeTransfer(ALICE_ID, BOB_ID, -10);
    } catch {
      // expected
    }

    const alice = await accountRepo.findById(ALICE_ID);
    const bob = await accountRepo.findById(BOB_ID);
    expect(alice!.balance).toBe(500);
    expect(bob!.balance).toBe(200);
  });
});
