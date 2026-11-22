import * as React from "react";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { Range } from "../shared/range";
import { TransactionsTable } from "./transactions-table";
import { StockAppAPI } from "../shared/utilities/stock-app-api";
import { DateChangeEvent } from "../shared/event-types";
import { Nullable } from "primereact/ts-helpers";
import { SchwabTransaction } from "../shared/types";

const TransactionTab: React.FC<{ accountType: string }> = ({ accountType }) => {
  const [symbol, setSymbol] = React.useState("");
  const [startDate, setStartDate] = React.useState<Nullable<Date>>(new Date());
  const [endDate, setEndDate] = React.useState<Nullable<Date>>(new Date());
  const [transactions, setTransactions] = React.useState<SchwabTransaction[]>(
    [],
  );

  const changeSymbol = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSymbol(e.target.value);
  };

  const submit = () => {
    if (!startDate || !endDate) return;

    const startString = startDate.toISOString().split("T")[0];
    const endString = endDate.toISOString().split("T")[0];

    StockAppAPI.retrieveTransactions(symbol, startString, endString, accountType)
      .then((data) => {
        console.log(data);
        setTransactions(data);
      })
      .catch((err) => {
        console.log(err);
      });
  };

  const handleStartDate = (e: DateChangeEvent) => {
    setStartDate(e.target.value);
  };

  const handleEndDate = (e: DateChangeEvent) => {
    setEndDate(e.target.value);
  };

  return (
    <div>
      <InputText value={symbol} onChange={changeSymbol} />
      <Range
        startDate={startDate}
        endDate={endDate}
        setStartDate={handleStartDate}
        setEndDate={handleEndDate}
      />
      <Button label="Submit" onClick={submit} />
      <div hidden={transactions.length === 0}>
        <TransactionsTable transactions={transactions} />
      </div>
    </div>
  );
};

export default TransactionTab;
