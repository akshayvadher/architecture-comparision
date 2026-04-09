export interface AccountCreatedEvent {
  type: 'AccountCreated';
  data: {
    accountId: string;
    owner: string;
    balance: number;
    status: string;
  };
}

export interface AccountDebitedEvent {
  type: 'AccountDebited';
  data: {
    accountId: string;
    amount: number;
    transferId: string;
  };
}

export interface AccountCreditedEvent {
  type: 'AccountCredited';
  data: {
    accountId: string;
    amount: number;
    transferId: string;
  };
}

export type AccountEvent =
  | AccountCreatedEvent
  | AccountDebitedEvent
  | AccountCreditedEvent;
