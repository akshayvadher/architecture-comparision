import { Inject, Injectable } from '@nestjs/common';
import { InvalidIdError, TransferNotFoundError } from '../../entities/errors';
import { TRANSFER_GATEWAY, TransferGateway } from '../gateways/transfer.gateway';
import { GetTransferInput } from './get-transfer.input';
import { GetTransferOutput } from './get-transfer.output';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class GetTransferUseCase {
  constructor(
    @Inject(TRANSFER_GATEWAY) private readonly transferGateway: TransferGateway,
  ) {}

  async execute(input: GetTransferInput): Promise<GetTransferOutput> {
    if (!UUID_REGEX.test(input.transferId)) {
      throw new InvalidIdError(input.transferId);
    }

    const transfer = await this.transferGateway.findById(input.transferId);
    if (!transfer) {
      throw new TransferNotFoundError(input.transferId);
    }

    return {
      id: transfer.id,
      fromAccountId: transfer.fromAccountId,
      toAccountId: transfer.toAccountId,
      amount: transfer.amount,
      timestamp: transfer.timestamp,
      status: transfer.status,
    };
  }
}
