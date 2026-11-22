import * as React from "react";
import { useState, useEffect } from "react";
import { Button } from "primereact/button";
import "../shared/nav-bar.scss";
import {
  AutoComplete,
  AutoCompleteChangeEvent,
  AutoCompleteCompleteEvent,
} from "primereact/autocomplete";
import { Range } from "../shared/range";
import { Results } from "./back-test-results";
import { NameIdPair } from "../shared/types";
import { StockAppAPI } from "../shared/utilities/stock-app-api";
import "./back-test-page.scss";
import { FormEvent, Nullable } from "primereact/ts-helpers";

function getIdArr(strats: NameIdPair[]) {
  return strats.map((strat) => strat.id);
}

/* Page to run a back test */
export default function BackTestPage() {
  const [startDate, setStartDate] = useState<Nullable<Date>>(new Date());
  const [endDate, setEndDate] = useState<Nullable<Date>>(new Date());
  const [tests, setTests] = useState<NameIdPair[]>([]);
  const [results, setResults] = useState({});
  const [stored, setStored] = useState<boolean>(false);
  const [strats, setStrats] = useState<NameIdPair[]>([]);
  const [stockGroups, setStockGroups] = useState<NameIdPair[]>([]);
  const [group, setGroup] = useState<NameIdPair>({ name: "", id: 0 });
  const [filteredGroups, setFilteredGroups] = useState<NameIdPair[]>([]);
  const [filteredNames, setFilteredNames] = useState<NameIdPair[]>([]);
  const [error, setError] = useState("");

  const onStartDateChange = (
    d: FormEvent<Date, React.SyntheticEvent<Element, Event>>,
  ) => {
    setStartDate(d.target.value ?? null);
  };

  const onEndDateChange = (
    d: FormEvent<Date, React.SyntheticEvent<Element, Event>>,
  ) => {
    setEndDate(d.target.value ?? null);
  };

  const changeGroupName = (e: AutoCompleteChangeEvent) => {
    setGroup(e.target.value);
  };

  const changeTestNames = (e: AutoCompleteChangeEvent) => {
    if (!e.value) return;
    setTests(e.value);
  };

  const run = () => {
    if (!validate()) {
      setError(
        "Please fill all the required fields. And end date must be after start date",
      );
    } else {
      setError("");
      StockAppAPI.runBackTests(
        getIdArr(tests),
        startDate?.getTime(),
        endDate?.getTime(),
        group.id,
        stored,
      )
        .then((data) => {
          for (const key of Object.keys(data)) {
            data[key].total = parseFloat((data[key].total * 100).toFixed(2));
          }
          setResults(data);
        })
        .catch((error) => {
          console.log(error.response?.data?.message);
        });
    }
  };

  const clear = () => {
    setStartDate(new Date());
    setEndDate(new Date());
    setTests([]);
    setStored(false);
  };

  const searchNames = (event: AutoCompleteCompleteEvent) => {
    setTimeout(() => {
      const results = strats.filter((pair) =>
        pair.name.toLowerCase().startsWith(event.query.toLowerCase()),
      );
      setFilteredNames(results);
    }, 250);
  };

  const searchGroups = (event: AutoCompleteCompleteEvent) => {
    setTimeout(() => {
      const results = stockGroups.filter((pair) =>
        pair.name.toLowerCase().startsWith(event.query.toLowerCase()),
      );
      setFilteredGroups(results);
    }, 250);
  };

  const validate = () => {
    return group && tests.length && endDate && startDate && endDate > startDate;
  };

  const refreshGroups = () => {
    StockAppAPI.getAllStockGroupNames().then((resp) => setStockGroups(resp));
  };

  const refreshStrategies = () => {
    StockAppAPI.getAllStrategyNames().then((resp) => setStrats(resp));
  };

  useEffect(() => {
    StockAppAPI.getAllStrategyNames().then((resp) => setStrats(resp));
    StockAppAPI.getAllStockGroupNames().then((resp) => setStockGroups(resp));
  }, []);

  return (
    <div className="backtest-container">
      <Button
        label="Refresh groups (only here for testing purposes)"
        onClick={refreshGroups}
      />
      <Button
        label="Refresh strategies (only here for testing purposes)"
        onClick={refreshStrategies}
      />

      <h2>Back tests</h2>

      <div className="form-section">
        <AutoComplete
          field="name"
          multiple
          completeMethod={searchNames}
          suggestions={filteredNames}
          placeholder="Strategy Name"
          value={tests}
          onChange={changeTestNames}
          className={!tests.length ? "invalid" : ""}
        />

        <AutoComplete
          field="name"
          completeMethod={searchGroups}
          suggestions={filteredGroups}
          placeholder="Stock Group Name"
          value={group}
          onChange={changeGroupName}
          className={!group?.id ? "invalid" : ""}
        />

        <Range
          startDate={startDate as Date}
          endDate={endDate as Date}
          setStartDate={onStartDateChange}
          setEndDate={onEndDateChange}
        />

        {error && <p className="error">{error}</p>}

        <div className="button-row">
          <Button label="Run back test" onClick={run} />
          <Button
            label="Clear"
            className="p-button-secondary"
            onClick={clear}
          />
        </div>
      </div>

      <Results results={results} startTime={startDate as Date | null} endTime={endDate as Date | null} />
    </div>
  );
}
