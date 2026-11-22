import { Transaction, TransactionEntity } from "../types/entity-types";

const TransactionMapper = {
  convertTransactionToEntity(transaction: Transaction): TransactionEntity {
    return {
      symbol: transaction.symbol,
      datetime: transaction.datetime,
      quantity: transaction.quantity,
      simulation: transaction.simulation,
      net_percent_gain: transaction.netPercentGain,
      net_gain: transaction.netGain,
    };
  },

  convertEntityToTransaction(entity: TransactionEntity): Transaction {
    return {
      netGain: entity.net_gain,
      netPercentGain: entity.net_percent_gain,
      symbol: entity.symbol,
      datetime: entity.datetime,
      quantity: entity.quantity,
      simulation: entity.simulation,
    };
  },
};

export default TransactionMapper;
