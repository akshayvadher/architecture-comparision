import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountsRepository } from '../../src/accounts/accounts.repository';
import type { DrizzleDB } from '../../src/database/drizzle.provider';
import type { TransfersRepository } from '../../src/transfers/transfers.repository';
import { TransfersService } from '../../src/transfers/transfers.service';

const FROM_ID = '11111111-2222-4333-8444-555555555555';
const TO_ID = '22222222-3333-4444-8555-666666666666';
const TRANSFER_ID = '33333333-4444-4555-8666-777777777777';

function mockAccountsRepo() {
  return {
    insert: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    findByIdForUpdate: vi.fn(),
    updateBalance: vi.fn(),
  };
}

function mockTransfersRepo() {
  return {
    insert: vi.fn(),
    findById: vi.fn(),
    insertWithDefaultDb: vi.fn(),
  };
}

function mockDb() {
  return {
    transaction: vi.fn(async (work: (tx: unknown) => Promise<unknown>) =>
      work({}),
    ),
  };
}

function makeService(
  db: ReturnType<typeof mockDb>,
  accountsRepo: ReturnType<typeof mockAccountsRepo>,
  transfersRepo: ReturnType<typeof mockTransfersRepo>,
) {
  return new TransfersService(
    db as unknown as DrizzleDB,
    accountsRepo as unknown as AccountsRepository,
    transfersRepo as unknown as TransfersRepository,
  );
}

describe('TransfersService — unit (repositories and db mocked)', () => {
  let db: ReturnType<typeof mockDb>;
  let accountsRepo: ReturnType<typeof mockAccountsRepo>;
  let transfersRepo: ReturnType<typeof mockTransfersRepo>;
  let service: TransfersService;

  beforeEach(() => {
    db = mockDb();
    accountsRepo = mockAccountsRepo();
    transfersRepo = mockTransfersRepo();
    service = makeService(db, accountsRepo, transfersRepo);
  });

  describe('getTransferById', () => {
    it('rejects a non-UUID id without touching the repository', async () => {
      await expect(
        service.getTransferById('not-a-uuid'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(transfersRepo.findById).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the repository returns undefined', async () => {
      transfersRepo.findById.mockResolvedValue(undefined);

      await expect(service.getTransferById(TRANSFER_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(transfersRepo.findById).toHaveBeenCalledWith(TRANSFER_ID);
    });

    it('returns the transfer with amount parsed to a number', async () => {
      const timestamp = new Date('2026-04-01T10:00:00Z');
      transfersRepo.findById.mockResolvedValue({
        id: TRANSFER_ID,
        fromAccountId: FROM_ID,
        toAccountId: TO_ID,
        amount: '42.50',
        timestamp,
        status: 'COMPLETED',
      });

      const result = await service.getTransferById(TRANSFER_ID);

      expect(result).toEqual({
        id: TRANSFER_ID,
        fromAccountId: FROM_ID,
        toAccountId: TO_ID,
        amount: 42.5,
        timestamp,
        status: 'COMPLETED',
      });
    });
  });

  describe('executeTransfer — validation before any DB work', () => {
    it('rejects zero amount without loading accounts', async () => {
      await expect(
        service.executeTransfer(FROM_ID, TO_ID, 0),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(accountsRepo.findById).not.toHaveBeenCalled();
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('rejects a negative amount', async () => {
      await expect(
        service.executeTransfer(FROM_ID, TO_ID, -10),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(accountsRepo.findById).not.toHaveBeenCalled();
    });

    it('rejects a non-UUID source id', async () => {
      await expect(
        service.executeTransfer('bad-id', TO_ID, 100),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(accountsRepo.findById).not.toHaveBeenCalled();
    });

    it('rejects a non-UUID destination id', async () => {
      await expect(
        service.executeTransfer(FROM_ID, 'bad-id', 100),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(accountsRepo.findById).not.toHaveBeenCalled();
    });
  });

  describe('executeTransfer — account existence', () => {
    it('throws NotFoundException when source account does not exist', async () => {
      accountsRepo.findById.mockResolvedValueOnce(undefined);

      await expect(
        service.executeTransfer(FROM_ID, TO_ID, 100),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when destination account does not exist', async () => {
      accountsRepo.findById
        .mockResolvedValueOnce({
          id: FROM_ID,
          owner: 'Alice',
          balance: '500',
          status: 'ACTIVE',
        })
        .mockResolvedValueOnce(undefined);

      await expect(
        service.executeTransfer(FROM_ID, TO_ID, 100),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(db.transaction).not.toHaveBeenCalled();
    });
  });

  describe('executeTransfer — happy path', () => {
    beforeEach(() => {
      accountsRepo.findById.mockResolvedValue({
        id: FROM_ID,
        owner: 'Alice',
        balance: '500',
        status: 'ACTIVE',
      });
      accountsRepo.findByIdForUpdate
        .mockResolvedValueOnce({
          id: FROM_ID,
          owner: 'Alice',
          balance: '500',
          status: 'ACTIVE',
        })
        .mockResolvedValueOnce({
          id: TO_ID,
          owner: 'Bob',
          balance: '100',
          status: 'ACTIVE',
        });
      transfersRepo.insert.mockImplementation(async (_tx, row) => row);
    });

    it('debits source, credits destination, and records a COMPLETED transfer', async () => {
      const result = await service.executeTransfer(FROM_ID, TO_ID, 200);

      expect(accountsRepo.updateBalance).toHaveBeenCalledWith(
        {},
        FROM_ID,
        '300.00',
      );
      expect(accountsRepo.updateBalance).toHaveBeenCalledWith(
        {},
        TO_ID,
        '300.00',
      );
      expect(transfersRepo.insert).toHaveBeenCalledTimes(1);
      const [, insertedRow] = transfersRepo.insert.mock.calls[0];
      expect(insertedRow).toMatchObject({
        fromAccountId: FROM_ID,
        toAccountId: TO_ID,
        amount: '200.00',
        status: 'COMPLETED',
      });
      expect(result.status).toBe('COMPLETED');
      expect(result.amount).toBe(200);
    });
  });

  describe('executeTransfer — insufficient funds', () => {
    beforeEach(() => {
      accountsRepo.findById.mockResolvedValue({
        id: FROM_ID,
        owner: 'Alice',
        balance: '50',
        status: 'ACTIVE',
      });
      accountsRepo.findByIdForUpdate
        .mockResolvedValueOnce({
          id: FROM_ID,
          owner: 'Alice',
          balance: '50',
          status: 'ACTIVE',
        })
        .mockResolvedValueOnce({
          id: TO_ID,
          owner: 'Bob',
          balance: '100',
          status: 'ACTIVE',
        });
      transfersRepo.insertWithDefaultDb.mockImplementation(
        async (row) => row,
      );
    });

    it('throws BadRequestException, records a FAILED transfer, and does not update balances', async () => {
      await expect(
        service.executeTransfer(FROM_ID, TO_ID, 200),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(accountsRepo.updateBalance).not.toHaveBeenCalled();
      expect(transfersRepo.insert).not.toHaveBeenCalled();
      expect(transfersRepo.insertWithDefaultDb).toHaveBeenCalledTimes(1);
      const [failedRow] = transfersRepo.insertWithDefaultDb.mock.calls[0];
      expect(failedRow).toMatchObject({
        fromAccountId: FROM_ID,
        toAccountId: TO_ID,
        amount: '200.00',
        status: 'FAILED',
      });
    });
  });
});
