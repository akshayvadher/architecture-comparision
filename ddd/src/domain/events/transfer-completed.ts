import type { DomainEvent } from './domain-event';

export interface TransferCompleted extends DomainEvent {
  type: 'TransferCompleted';
  data: {
    transferId: string;
    fromAccountId: string;
    toAccountId: string;
    amount: number;
  };
}
