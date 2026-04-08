import { AccountGateway } from './account.gateway';
import { TransferGateway } from './transfer.gateway';

export const UNIT_OF_WORK = Symbol('UNIT_OF_WORK');

export interface UnitOfWorkGateway {
  execute<T>(
    work: (gateways: {
      accountGateway: AccountGateway;
      transferGateway: TransferGateway;
    }) => Promise<T>,
  ): Promise<T>;
}
