import type { AccountGateway } from '../src/use-cases/gateways/account.gateway';
import type { TransferGateway } from '../src/use-cases/gateways/transfer.gateway';
import type { UnitOfWorkGateway } from '../src/use-cases/gateways/unit-of-work.gateway';

export class InMemoryUnitOfWork implements UnitOfWorkGateway {
  constructor(
    private readonly accountGateway: AccountGateway,
    private readonly transferGateway: TransferGateway,
  ) {}

  async execute<T>(
    work: (gateways: {
      accountGateway: AccountGateway;
      transferGateway: TransferGateway;
    }) => Promise<T>,
  ): Promise<T> {
    return work({
      accountGateway: this.accountGateway,
      transferGateway: this.transferGateway,
    });
  }
}
