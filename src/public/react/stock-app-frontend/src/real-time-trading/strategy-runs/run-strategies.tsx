import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "primereact/button";
import {
  AutoComplete,
  AutoCompleteChangeEvent,
  AutoCompleteCompleteEvent,
} from "primereact/autocomplete";
import "./run-strategies.scss";
import { SimulationTable } from "./simulation-table";
import { IStrategyRun, ITransaction, NameIdPair } from "../../shared/types";
import { StockAppAPI } from "../../shared/utilities/stock-app-api";
import React from "react";

function getIdArr(strategies: IStrategyRun[]) {
  return strategies.map((strat) => strat.id);
}

function splitByRunId(
  transactions: ITransaction[],
): Record<number, ITransaction[]> {
  return transactions.reduce(
    (acc: Record<number, ITransaction[]>, transaction) => {
      const { runId } = transaction;
      if (!acc[runId]) acc[runId] = [];
      acc[runId].push(transaction);
      return acc;
    },
    {},
  );
}

const RunStrategiesPage: React.FC = () => {
  const simLastPingTime = useRef(0);
  const currentSimulationsRef = useRef<IStrategyRun[]>([]);

  const [simulationError, setSimulationError] = useState("");
  const [currentSimulations, setCurrentSimulations] = useState<IStrategyRun[]>(
    [],
  );
  const [notifyOnEntry, setNotifyOnEntry] = useState(false);
  //const [prevRuns, setPrevRuns] = useState<unknown[]>([]);
  const [filteredGroupNameIdPairs, setFilteredGroupNameIdPairs] = useState<
    NameIdPair[]
  >([]);
  const [simulationGroup, setSimulationGroup] = useState<NameIdPair>({
    name: "",
    id: 0,
  });
  const [stockGroupNameIdPairs, setStockGroupNameIdPairs] = useState<
    NameIdPair[]
  >([]);
  const [strategyNameIdPairs, setStrategyNameIdPairs] = useState<NameIdPair[]>(
    [],
  );
  const [filteredNameIdPairs, setFilteredNameIdPairs] = useState<NameIdPair[]>(
    [],
  );
  const [strategyNames, setStrategyNames] = useState<NameIdPair[]>([]);
  const [simTransactions, setSimTransactions] = useState<
    Record<string | number, ITransaction[]>
  >({ 0: [] });
  //const [previousSimulationStrategyNames, setPreviousSimulationStrategyNames] = useState<NameIdPair[]>([]);

  const changeSimNames = (e: AutoCompleteChangeEvent) =>
    setStrategyNames(e.value);
  const changeGroupName1 = (e: AutoCompleteChangeEvent) =>
    setSimulationGroup(e.target.value);
  const toggleNotifyOnEntry = () => setNotifyOnEntry((prev) => !prev);

  const searchNames = (event: AutoCompleteCompleteEvent) => {
    setTimeout(() => {
      const results = strategyNameIdPairs.filter((pair) =>
        pair.name.toLowerCase().startsWith(event.query.toLowerCase()),
      );
      setFilteredNameIdPairs(results);
    }, 200);
  };

  const searchGroups = (event: AutoCompleteCompleteEvent) => {
    setTimeout(() => {
      const results = stockGroupNameIdPairs.filter((pair) =>
        pair.name.toLowerCase().startsWith(event.query.toLowerCase()),
      );
      setFilteredGroupNameIdPairs(results);
    }, 200);
  };

  const removeSimulation = (id: number) => {
    setCurrentSimulations((prev) => prev.filter((sim) => sim.id !== id));
    setSimTransactions((prev) => {
      const { [id]: _, ...rest } = prev;
      void _;
      return rest;
    });
  };

  const appendSimulationTransactions = useCallback(
    (transactions: ITransaction[]) => {
      const split = splitByRunId(transactions);
      setSimTransactions((state) => {
        const newState: Record<string, ITransaction[]> = { ...state };
        for (const [key, value] of Object.entries(split)) {
          newState[key] = state[key] ? [...state[key], ...value] : value;
        }
        return newState;
      });
    },
    [],
  );

  const validateSimulation = () => {
    let errorText = "";
    if (strategyNames.length === 0 || !simulationGroup) {
      errorText = "Please select at least one strategy and a group";
    } else {
      for (const sim of strategyNames) {
        if (
          currentSimulations.findIndex((curSim) => curSim.id === sim.id) > -1
        ) {
          errorText = `Simulation ${sim.name} already running.`;
          break;
        }
      }
    }
    return errorText;
  };

  const runSimulations = () => {
    const error = validateSimulation();
    if (error) {
      setSimulationError(error);
      return;
    }
    StockAppAPI.runSimulations(
      strategyNames.map((s) => s.id),
      simulationGroup.id,
      notifyOnEntry,
    )
      .then((resp) => {
        console.log("success initializing simulations");
        setSimulationError("");
        setCurrentSimulations((state) => [
          ...state,
          ...resp.runs.map(
            (run: { id: number; strategy_id: number; start_time: string }) => ({
              id: run.id,
              strategyName:
                strategyNameIdPairs.find((pair) => pair.id === run.strategy_id)
                  ?.name || "",
              groupName: simulationGroup.name,
              startTime: run.start_time,
            }),
          ),
        ]);
        setStrategyNames([]);
        getSimulationsTransactions(0);
      })
      .catch((err) => {
        setSimulationError(err.response?.data?.message);
        console.log("Error:", err.response?.data?.message);
      });
  };

  const getSimulationsTransactions = useCallback(
    (pingTime: number, runIds?: number[]) => {
      const ids = runIds ?? getIdArr(currentSimulationsRef.current);
      if (!ids.length) return;
      return StockAppAPI.getSimulationsTransactions(ids, pingTime)
        .then((data) => {
          appendSimulationTransactions(data.simTransactions);
        })
        .catch(console.log);
    },
    [appendSimulationTransactions],
  );

  useEffect(() => {
    currentSimulationsRef.current = currentSimulations;
  }, [currentSimulations]);

  const pingSimulations = () => {
    const lastPing = simLastPingTime.current;
    simLastPingTime.current = Date.now();
    return getSimulationsTransactions(lastPing);
  };

  useEffect(() => {
    StockAppAPI.getAllStrategyNames().then(setStrategyNameIdPairs);
    StockAppAPI.getAllStockGroupNames().then(setStockGroupNameIdPairs);

    StockAppAPI.getCurrentRunningSimulations()
      .then((simulations) => {
        if (simulations.length > 0) setCurrentSimulations(simulations);
        if (simulations.length > 0) {
          const lastPing = simLastPingTime.current;
          simLastPingTime.current = Date.now();
          getSimulationsTransactions(lastPing, getIdArr(simulations));
        }
      })
      .catch((err) => console.log(err.response?.data?.message));
  }, [getSimulationsTransactions]);

  return (
    <div className="run-strategies-page">
      <h2 className="section-header">Simulations</h2>

      <div className="card">
        <div className="form-grid">
          <AutoComplete
            field="name"
            multiple
            completeMethod={searchNames}
            suggestions={filteredNameIdPairs}
            placeholder="Strategy Name"
            value={strategyNames}
            onChange={changeSimNames}
            className="w-full"
          />
          <AutoComplete
            field="name"
            completeMethod={searchGroups}
            suggestions={filteredGroupNameIdPairs}
            placeholder="Stock Group Name"
            value={simulationGroup}
            onChange={changeGroupName1}
            className="w-full"
          />
          <label className="notify-toggle">
            <input
              type="checkbox"
              checked={notifyOnEntry}
              onChange={toggleNotifyOnEntry}
            />
            <span>Notify</span>
          </label>
          {simulationError && <p className="error-text">{simulationError}</p>}
          <Button
            label="Run Simulation"
            icon="pi pi-play"
            className="p-button-success"
            onClick={runSimulations}
          />
        </div>

        {currentSimulations.map((sim) => (
          <SimulationTable
            key={sim.id}
            id={sim.id}
            strategyName={sim.strategyName}
            groupName={sim.groupName}
            removeSimulation={removeSimulation}
            transactions={simTransactions[sim.id]}
          />
        ))}
      </div>

      <div className="actions">
        <Button
          label="Ping Simulations"
          icon="pi pi-sync"
          className="p-button-secondary"
          onClick={pingSimulations}
        />
      </div>

    </div>
  );
};

export default RunStrategiesPage;
