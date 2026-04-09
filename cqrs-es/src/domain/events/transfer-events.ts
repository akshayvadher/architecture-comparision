export interface TransferInitiatedEvent {
  type: 'TransferInitiated';
  data: {
    transferId: string;
    fromAccountId: string;
    toAccountId: string;
    amount: number;
    timestamp: string;
  };
}

export interface TransferCompletedEvent {
  type: 'TransferCompleted';
  data: {
    transferId: string;
    timestamp: string;
  };
}

export interface TransferFailedEvent {
  type: 'TransferFailed';
  data: {
    transferId: string;
    reason: string;
    timestamp: string;
  };
}

export type TransferEvent =
  | TransferInitiatedEvent
  | TransferCompletedEvent
  | TransferFailedEvent;
