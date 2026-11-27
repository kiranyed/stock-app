import TransactionMapper from "../mappers/transaction-mapper";
import TransactionRepository, { TransactionKind } from "../shared/services/repos/transaction-repository";
import { Transaction } from "../types/entity-types";

/** Closed trades of live runs, always on behalf of one user. */
export class TransactionService {
  /** The user's transactions for `runIds` newer than `since`; runs the user doesn't own are left out. */
  static async list(userId: number, kind: TransactionKind, runIds: number[], since: number): Promise<Transaction[]> {
    const rows = await TransactionRepository.getOwnedTransactions(kind, runIds, userId, since);
    return rows.map((row) => TransactionMapper.convertEntityToTransaction(row));
  }
}
