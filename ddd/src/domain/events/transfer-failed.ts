import type { DomainEvent } from './domain-event';

export interface TransferFailed extends DomainEvent {
  type: 'TransferFailed';
  data: {
    transferId: string;
    fromAccountId: string;
    toAccountId: string;
    amount: number;
    reason: string;
  };
}
