import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AccountsRepository } from '../../src/accounts/accounts.repository';
import { AccountsService } from '../../src/accounts/accounts.service';
import { DRIZZLE } from '../../src/database/drizzle.provider';
import { TransfersRepository } from '../../src/transfers/transfers.repository';
import { TransfersService } from '../../src/transfers/transfers.service';
import { db } from '../setup';

describe('Transfer Retrieval', () => {
  let transfersService: TransfersService;
  let accountsService: AccountsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        TransfersService,
        TransfersRepository,
        AccountsService,
        AccountsRepository,
        { provide: DRIZZLE, useValue: db },
      ],
    }).compile();

    transfersService = module.get(TransfersService);
    accountsService = module.get(AccountsService);
  });

  describe('get transfer by id', () => {
    it('retrieves a completed transfer by its id', async () => {
      const source = await accountsService.createAccount('Alice', 500);
      const destination = await accountsService.createAccount('Bob', 200);
      const created = await transfersService.executeTransfer(
        source.id,
        destination.id,
        150,
      );

      const found = await transfersService.getTransferById(created.id);

      expect(found.id).toBe(created.id);
      expect(found.fromAccountId).toBe(source.id);
      expect(found.toAccountId).toBe(destination.id);
      expect(found.amount).toBe(150);
      expect(found.timestamp).toBeInstanceOf(Date);
      expect(found.status).toBe('COMPLETED');
    });

    it('returns the transfer with all required fields', async () => {
      const source = await accountsService.createAccount('Alice', 500);
      const destination = await accountsService.createAccount('Bob', 200);
      const created = await transfersService.executeTransfer(
        source.id,
        destination.id,
        100,
      );

      const found = await transfersService.getTransferById(created.id);

      expect(found).toEqual(
        expect.objectContaining({
          id: expect.stringMatching(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
          ),
          fromAccountId: source.id,
          toAccountId: destination.id,
          amount: 100,
          status: 'COMPLETED',
        }),
      );
      expect(found.timestamp).toBeInstanceOf(Date);
    });

    it('throws not-found error for a non-existent transfer id', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';

      await expect(
        transfersService.getTransferById(nonExistentId),
      ).rejects.toThrow(
        'Transfer with id 00000000-0000-0000-0000-000000000000 not found',
      );
    });

    it('throws error for an invalid id format', async () => {
      await expect(
        transfersService.getTransferById('not-a-uuid'),
      ).rejects.toThrow('Invalid transfer id format');
    });

    it('throws error for an empty id', async () => {
      await expect(transfersService.getTransferById('')).rejects.toThrow(
        'Invalid transfer id format',
      );
    });
  });
});
