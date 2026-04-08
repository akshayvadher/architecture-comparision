export interface ListAccountsOutput {
  accounts: Array<{
    id: string;
    owner: string;
    balance: number;
    status: string;
  }>;
}
