import type { GetTransferOutput } from '../../use-cases/get-transfer/get-transfer.output';
import type { InitiateTransferOutput } from '../../use-cases/initiate-transfer/initiate-transfer.output';

export function presentTransfer(
  output: InitiateTransferOutput | GetTransferOutput,
) {
  return {
    id: output.id,
    fromAccountId: output.fromAccountId,
    toAccountId: output.toAccountId,
    amount: output.amount,
    timestamp: output.timestamp,
    status: output.status,
  };
}
