import { GetAccountOutput } from '../../use-cases/get-account/get-account.output';
import { ListAccountsOutput } from '../../use-cases/list-accounts/list-accounts.output';

export function presentAccount(output: GetAccountOutput) {
  return {
    id: output.id,
    owner: output.owner,
    balance: output.balance,
    status: output.status,
  };
}

export function presentAccountList(output: ListAccountsOutput) {
  return output.accounts.map(presentAccount);
}
