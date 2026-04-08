export interface InitiateTransferOutput {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  timestamp: Date;
  status: string;
}
