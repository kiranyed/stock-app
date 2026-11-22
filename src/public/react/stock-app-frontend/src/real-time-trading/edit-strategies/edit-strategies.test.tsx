import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import EditStrategiesPageNew from "./edit-strategies";
import { StockAppAPI } from "../../shared/utilities/stock-app-api";
import { IStrategy } from "../../shared/types";

jest.mock("../../shared/utilities/stock-app-api");

// Mock StrategyDialog so tests aren't coupled to its internal screener validation.
// The dialog's own unit tests cover that logic.
jest.mock("./strategy-dialog", () => ({
  __esModule: true,
  default: ({ submit, visible, strategy }: { submit: (s: IStrategy) => void; visible: boolean; strategy: IStrategy; onHide: () => void }) => {
    if (!visible) return null;
    return (
      <div role="dialog" aria-label="strategy-dialog">
        <button
          onClick={() =>
            submit({ ...strategy, name: strategy.name || "New Strategy", description: strategy.description || "desc", period: strategy.period || 5 })
          }
        >
          Submit Strategy
        </button>
      </div>
    );
  },
}));

const mockStrategies: IStrategy[] = [
  { id: 1, name: "U-Shape", description: "U-shape dip strategy", period: 1440, screeners: [] },
  { id: 2, name: "Overbought", description: "RSI overbought", period: 5, screeners: [] },
];

/** Find all <button> elements whose content includes the given PrimeReact icon class */
const findIconButtons = (container: HTMLElement, iconClass: string) =>
  Array.from(container.querySelectorAll("button")).filter((btn) =>
    btn.querySelector(`.${iconClass}`),
  );

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(StockAppAPI, "getAllStrategies").mockResolvedValue([...mockStrategies]);
  jest.spyOn(StockAppAPI, "createStrategy").mockResolvedValue({ id: 99 });
  jest.spyOn(StockAppAPI, "saveStrategy").mockResolvedValue(undefined);
  jest.spyOn(StockAppAPI, "deleteStrategy").mockResolvedValue(undefined);
  jest.spyOn(StockAppAPI, "deleteStrategies").mockResolvedValue(undefined);
});

describe("EditStrategiesPageNew", () => {
  it("fetches and displays strategies on mount", async () => {
    render(<EditStrategiesPageNew />);
    expect(await screen.findByText("U-Shape")).toBeInTheDocument();
    expect(screen.getByText("Overbought")).toBeInTheDocument();
    expect(StockAppAPI.getAllStrategies).toHaveBeenCalledTimes(1);
  });

  it("Delete Selected button is disabled when nothing is selected", async () => {
    render(<EditStrategiesPageNew />);
    await screen.findByText("U-Shape");
    const deleteSelectedBtn = screen.getByRole("button", { name: /delete selected/i });
    expect(deleteSelectedBtn).toBeDisabled();
  });

  it("opens the strategy dialog when New Strategy is clicked", async () => {
    render(<EditStrategiesPageNew />);
    await screen.findByText("U-Shape");
    fireEvent.click(screen.getByRole("button", { name: /new strategy/i }));
    expect(screen.getByRole("dialog", { name: "strategy-dialog" })).toBeInTheDocument();
  });

  it("calls createStrategy when dialog submits a new strategy (id = 0)", async () => {
    render(<EditStrategiesPageNew />);
    await screen.findByText("U-Shape");

    fireEvent.click(screen.getByRole("button", { name: /new strategy/i }));
    fireEvent.click(screen.getByRole("button", { name: /submit strategy/i }));

    await waitFor(() => {
      expect(StockAppAPI.createStrategy).toHaveBeenCalledWith(
        expect.objectContaining({ id: 0, name: "New Strategy" }),
      );
    });
  });

  it("calls saveStrategy (not createStrategy) when dialog submits an existing strategy (id > 0)", async () => {
    const { container } = render(<EditStrategiesPageNew />);
    await screen.findByText("U-Shape");

    // Click the pencil (edit) icon button for the first row
    const editBtns = findIconButtons(container, "pi-pencil");
    expect(editBtns.length).toBeGreaterThan(0);
    fireEvent.click(editBtns[0]);

    fireEvent.click(screen.getByRole("button", { name: /submit strategy/i }));

    await waitFor(() => {
      expect(StockAppAPI.saveStrategy).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, name: "U-Shape" }),
      );
      expect(StockAppAPI.createStrategy).not.toHaveBeenCalled();
    });
  });

  it("calls deleteStrategy when a row delete is confirmed", async () => {
    const { container } = render(<EditStrategiesPageNew />);
    await screen.findByText("U-Shape");

    // Row-level trash buttons have the p-button-rounded class; the toolbar button does not
    const rowTrashBtns = findIconButtons(container, "pi-trash").filter((btn) =>
      btn.className.includes("rounded"),
    );
    expect(rowTrashBtns.length).toBeGreaterThan(0);
    fireEvent.click(rowTrashBtns[0]);

    const yesBtn = await screen.findByRole("button", { name: /^yes$/i });
    fireEvent.click(yesBtn);

    await waitFor(() => {
      expect(StockAppAPI.deleteStrategy).toHaveBeenCalledWith(1);
    });
  });
});


