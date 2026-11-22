import { SchwabTransaction } from "../shared/types";
import React from "react";
interface IProps {
  transactions: SchwabTransaction[];
}

export function TransactionsTable(props: IProps) {
  return (
    <table>
      <thead>
        <th>Symbol</th>
        <th>Price</th>
        <th>Instruction</th>
        <th>Date</th>
        <th>Quantity</th>
      </thead>
      <tbody>
        {props.transactions.map((trans, idx) => {
          const date = trans.transactionDate.split("T")[0];
          const amount = trans.transactionItem.amount;
          return (
            <tr key={idx}>
              <td>{trans.transactionItem.instrument.symbol}</td>
              <td>{trans.transactionItem.price}</td>
              <td>{trans.transactionItem.instruction}</td>
              <td>{date}</td>
              <td>{amount}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
