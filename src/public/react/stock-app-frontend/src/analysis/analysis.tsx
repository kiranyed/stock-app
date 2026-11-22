import * as React from "react";
import { Button } from "primereact/button";
import { Dropdown, DropdownChangeEvent } from "primereact/dropdown";
import {
  AutoComplete,
  AutoCompleteChangeEvent,
  AutoCompleteCompleteEvent,
} from "primereact/autocomplete";
import { Range } from "../shared/range";
import { AnalysisFilterGroup } from "./analysis-filter-group";
import { validateAnalysisForm } from "./analysis-util";
import { AnalysisDataTable } from "./analysis-data-table";
import { IAnalysisData, IFilter, NameIdPair } from "../shared/types";
import { StockAppAPI } from "../shared/utilities/stock-app-api";
import { InitUtil } from "../shared/utilities/init-util";
import "./analysis.scss";
import { FormEvent, Nullable } from "primereact/ts-helpers";

const periodOptions = [
  { label: "1 minute", value: 1 },
  { label: "5 minutes", value: 5 },
  { label: "10 minutes", value: 10 },
  { label: "30 minutes", value: 30 },
  { label: "1 hour", value: 60 },
  { label: "2 hours", value: 120 },
  { label: "1 day", value: 1440 },
  { label: "1 week", value: 10080 },
];

interface IProps {
  placeholder?: "";
}

const AnalysisPage: React.FC<IProps> = () => {
  const [state, setState] = React.useState({
    ...InitUtil.initFilterGroup(),
    dataFilters: [] as IFilter[],
    filters: [] as IFilter[],
    formEnabled: false,
    data: [] as IAnalysisData[],
    period: 0,
    startDate: new Date() as Nullable<Date>,
    endDate: new Date() as Nullable<Date>,
    group: { name: "", id: 0 } as NameIdPair,
    allGroups: [] as NameIdPair[],
    filteredNames: [] as string[],
    filteredNameIdPairs: [] as NameIdPair[],
    error: "",
  });

  const changeDataFilter = (newFilter: IFilter, index: number) => {
    setState((prev) => ({
      ...prev,
      dataFilters: prev.dataFilters.map((filter, i) =>
        i === index ? newFilter : filter,
      ),
    }));
  };

  const changeFilter = (newFilter: IFilter, index: number) => {
    setState((prev) => ({
      ...prev,
      filters: prev.filters.map((filter, i) =>
        i === index ? newFilter : filter,
      ),
    }));
  };

  const addFilter = (pre: boolean) => {
    const filt = InitUtil.initFilter();
    if (pre) {
      setState((prev) => ({ ...prev, filters: [...prev.filters, filt] }));
    } else {
      setState((prev) => ({
        ...prev,
        dataFilters: [...prev.dataFilters, filt],
      }));
    }
  };

  const changePeriod = (e: DropdownChangeEvent) => {
    setState((prev) => ({ ...prev, period: e.value }));
  };

  const runAnalysis = async () => {
    const valid = validateAnalysisForm(state);
    if (!valid) {
      setState((prev) => ({
        ...prev,
        error:
          "Please fill out all required fields. And start date must be before end date.",
      }));
    } else {
      StockAppAPI.getData(
        state.filters,
        state.dataFilters,
        state.period,
        state.startDate,
        state.endDate,
        state.group?.id,
      )
        .then((data) => {
          setState((prev) => ({ ...prev, data: data.analysisData, error: "" }));
        })
        .catch((err) => {
          setState((prev) => ({
            ...prev,
            error: err?.response?.data?.message,
          }));
          console.log(err);
        });
    }
  };

  const removeFilter = (i: number) => {
    setState((prev) => ({
      ...prev,
      filters: [...prev.filters.slice(0, i), ...prev.filters.slice(i + 1)],
    }));
  };

  const removeDataFilter = (i: number) => {
    setState((prev) => ({
      ...prev,
      dataFilters: [
        ...prev.dataFilters.slice(0, i),
        ...prev.dataFilters.slice(i + 1),
      ],
    }));
  };

  const setStartDate = (
    e: FormEvent<Date, React.SyntheticEvent<Element, Event>>,
  ) => {
    setState((prev) => ({ ...prev, startDate: e.value }));
  };

  const setEndDate = (
    e: FormEvent<Date, React.SyntheticEvent<Element, Event>>,
  ) => {
    setState((prev) => ({ ...prev, endDate: e.value }));
  };

  const changeGroupName = (e: AutoCompleteChangeEvent) => {
    setState((prev) => ({ ...prev, group: e.target.value }));
  };

  const searchGroups = (event: AutoCompleteCompleteEvent) => {
    setTimeout(() => {
      const results = state.allGroups.filter((group) =>
        group.name.toLowerCase().startsWith(event.query.toLowerCase()),
      );
      setState((prev) => ({ ...prev, filteredNameIdPairs: results }));
    }, 250);
  };

  React.useEffect(() => {
    StockAppAPI.getAllStockGroupNames().then((resp) => {
      setState((prev) => ({ ...prev, allGroups: resp }));
    });
  }, []);

  const {
    data,
    filters,
    dataFilters,
    period,
    startDate,
    endDate,
    group,
    error,
    filteredNameIdPairs,
  } = state;

  return (
    <div className="analysis-container">
      <h2>Stock Scenario Analysis</h2>

      {/* Top Section: Group & Period */}
      <div className="form-section">
        <label>Stock Group Name</label>
        <AutoComplete
          field="name"
          forceSelection
          completeMethod={searchGroups}
          suggestions={filteredNameIdPairs}
          placeholder="Stock Group Name"
          value={group}
          onChange={changeGroupName}
        />
        <label>Period Length</label>
        <Dropdown
          onChange={changePeriod}
          value={period}
          options={periodOptions}
          placeholder="Select a period length"
        />
      </div>

      {/* Filters Section */}
      <div className="form-section">
        <h3>Scenario Filters</h3>
        <AnalysisFilterGroup
          callback={changeFilter}
          removeFilter={removeFilter}
          filters={filters}
        />
        <Button
          label="Add filter"
          style={{ marginTop: "1rem" }}
          onClick={() => addFilter(true)}
        />
      </div>

      {/* Variables Section */}
      <div className="form-section">
        <h3>Variables to Retrieve</h3>
        <AnalysisFilterGroup
          dataFilters={true}
          callback={changeDataFilter}
          removeFilter={removeDataFilter}
          filters={dataFilters}
        />
        <Button
          label="Add variable"
          style={{ marginTop: "1rem" }}
          onClick={() => addFilter(false)}
        />
      </div>

      {/* Date Range Section */}
      <div className="form-section">
        <h3>Analysis Period</h3>
        <Range
          startDate={startDate}
          endDate={endDate}
          setStartDate={setStartDate}
          setEndDate={setEndDate}
        />
      </div>

      {/* Error display */}
      {error && <div className="error">{error}</div>}

      {/* Submit Button */}
      <Button
        label="Get data"
        className="primary-btn"
        style={{ marginTop: "2rem", marginBottom: "2rem" }}
        onClick={runAnalysis}
      />

      {/* Results Table */}
      <AnalysisDataTable
        data={data}
        filters={filters}
        dataFilters={dataFilters}
      />
    </div>
  );
};

export default AnalysisPage;
