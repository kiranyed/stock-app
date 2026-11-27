import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { getFilter } from "./filter-util";
import { FilterGroupUtil } from "./filter-group-util";
import { IFilter } from "../../shared/types";

const renderInputs = (
  varName: string,
  filter: Record<string, string> = {},
  compareVar = false,
) => {
  const makeChange = jest.fn();
  render(
    <>
      {getFilter({
        varName,
        makeChange,
        filter: { varName, ...filter },
        index: 0,
        compareVar,
      })}
    </>,
  );
  return makeChange;
};

const filter = (extra: Partial<IFilter> & Record<string, string>): IFilter => ({
  varName: "",
  operator: ">",
  compareVal: "0",
  compareVar: "",
  discriminator: "I-AM-EXPRESSION",
  ...extra,
});

describe("getFilter", () => {
  it("gives volume SMA a period input that writes timeAgo", () => {
    const makeChange = renderInputs("volumeSma");
    fireEvent.change(screen.getByLabelText(/Period/), {
      target: { value: "20" },
    });
    expect(makeChange).toHaveBeenCalledWith("timeAgo", "20", 0);
  });

  it("gives VWAP a bar period dropdown", () => {
    renderInputs("vwap");
    expect(screen.getByText("Bar period:")).toBeInTheDocument();
    expect(screen.getAllByText("Strategy period").length).toBeGreaterThan(0);
  });

  it("writes the compare variable's period to compareVarTimeAgo", () => {
    const makeChange = renderInputs("priceSma", {}, true);
    fireEvent.change(screen.getByLabelText(/Period/), {
      target: { value: "50" },
    });
    expect(makeChange).toHaveBeenCalledWith("compareVarTimeAgo", "50", 0);
  });

  it("writes TSI periods to the fields the engine reads", () => {
    const makeChange = renderInputs("tsi");
    fireEvent.change(screen.getByLabelText(/M period/), {
      target: { value: "25" },
    });
    expect(makeChange).toHaveBeenCalledWith("emaPeriod1", "25", 0);
  });

  it("shows a signal as bullish unless bullish is false", () => {
    renderInputs("rsiDivergence", { bullish: "false" });
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  it("has no inputs for adx", () => {
    const { container } = render(
      <>{getFilter({ varName: "adx", makeChange: jest.fn(), filter: {}, index: 0 })}</>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("FilterGroupUtil.validate", () => {
  it("asks for the params the engine needs", () => {
    expect(
      FilterGroupUtil.validate([filter({ varName: "macdSignalLine" })]),
    ).toBe("macdSignalLine: fill in fast period, slow period");
  });

  it("checks the compare variable's own period", () => {
    expect(
      FilterGroupUtil.validate([
        filter({ varName: "price", compareVar: "priceSma", compareVal: "" }),
      ]),
    ).toBe("priceSma (compare): fill in period");
  });

  it("accepts a compare value of 0", () => {
    expect(
      FilterGroupUtil.validate([
        filter({ varName: "percentchange", timeAgo: "1", compareVal: "0" }),
      ]),
    ).toBe("");
  });
});
