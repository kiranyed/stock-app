import TransactionMapper from "../../mappers/transaction-mapper";
import { Transaction, TransactionEntity } from "../../types/entity-types";

describe("TransactionMapper", () => {
  describe("convertTransactionToEntity", () => {
    it("should convert a Transaction to a TransactionEntity", () => {
      const transaction: Transaction = {
        symbol: "AAPL",
        datetime: 1622505600,
        netGain: 100,
        netPercentGain: 10,
        quantity: 1,
        simulation: true,
      };

      const expectedEntity: TransactionEntity = {
        symbol: "AAPL",
        datetime: 1622505600,
        net_gain: 100,
        net_percent_gain: 10,
        quantity: 1,
        simulation: true,
      };

      const result = TransactionMapper.convertTransactionToEntity(transaction);

      expect(result).toEqual(expectedEntity);
    });
  });

  describe("convertEntityToTransaction", () => {
    it("should convert a TransactionEntity to a Transaction", () => {
      const entity: TransactionEntity = {
        symbol: "AAPL",
        datetime: 1622505600,
        net_gain: 100,
        net_percent_gain: 10,
        simulation: false,
        quantity: 10,
      };

      const expectedTransaction: Transaction = {
        symbol: "AAPL",
        datetime: 1622505600,
        netGain: 100,
        netPercentGain: 10,
        simulation: false,
        quantity: 10,
      };

      const result = TransactionMapper.convertEntityToTransaction(entity);

      expect(result).toEqual(expectedTransaction);
    });
  });
});
