import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import {
  AccountNotFoundError,
  InvalidIdError,
} from '../domain/errors/domain-errors';
import {
  DRIZZLE,
  type DrizzleDB,
} from '../infrastructure/persistence/database';
import { accountReadModel } from '../infrastructure/persistence/schema';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AccountReadDto {
  id: string;
  owner: string;
  balance: number;
  status: string;
}

@Injectable()
export class GetAccountHandler {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async execute(id: string): Promise<AccountReadDto> {
    if (!UUID_REGEX.test(id)) {
      throw new InvalidIdError(id);
    }

    const rows = await this.db
      .select()
      .from(accountReadModel)
      .where(eq(accountReadModel.id, id));

    if (rows.length === 0) {
      throw new AccountNotFoundError(id);
    }

    const row = rows[0];
    return {
      id: row.id,
      owner: row.owner,
      balance: Number(row.balance),
      status: row.status,
    };
  }
}
