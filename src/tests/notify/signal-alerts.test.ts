import { entryAlert, exitAlert } from "../../notify/signal-alerts";

// 2026-11-23 14:35 Eastern
const T = Date.UTC(2026, 10, 23, 19, 35);
const signal = { runId: 7, strategyName: "Dip buyer", symbol: "AAPL", long: true, price: 187.5, time: T, showPrices: true };

describe("signal alerts", () => {
  it("an entry names the strategy, side, symbol, price and Eastern time", () => {
    expect(entryAlert(signal)).toEqual({
      kind: "entry",
      runId: 7,
      subject: "Dip buyer: entered long AAPL",
      body: "Dip buyer: entered long AAPL at 187.50 (11/23/2026, 2:35:00 PM ET)",
      dedupKey: `entry:7:AAPL:BUY:${T}`,
    });
    expect(entryAlert({ ...signal, long: false }).dedupKey).toBe(`entry:7:AAPL:SELL_SHORT:${T}`);
  });

  it("an exit gives the gain and why it closed", () => {
    expect(exitAlert({ ...signal, long: false, gainPercent: 4.256, reason: "signal" })).toEqual({
      kind: "exit",
      runId: 7,
      subject: "Dip buyer: exited short AAPL (+4.26%)",
      body: "Dip buyer: exited short AAPL at 187.50, +4.26%, exit signal (11/23/2026, 2:35:00 PM ET)",
      dedupKey: `exit:7:AAPL:${T}`,
    });
    expect(exitAlert({ ...signal, gainPercent: -1.5, reason: "session-end" }).body).toBe(
      "Dip buyer: exited long AAPL at 187.50, -1.50%, closed at the end of the session (11/23/2026, 2:35:00 PM ET)",
    );
  });

  it("says when it closed because the app missed the close or its screener was removed", () => {
    expect(exitAlert({ ...signal, gainPercent: 1, reason: "missed-close" }).body).toContain(
      "closed now: the app was down or paused at the end of the session it was entered in",
    );
    expect(exitAlert({ ...signal, gainPercent: 1, reason: "screener-removed" }).body).toContain("screener that entered it was removed");
  });

  it("leaves prices out when the data provider doesn't allow showing them", () => {
    expect(entryAlert({ ...signal, showPrices: false }).body).toBe("Dip buyer: entered long AAPL (11/23/2026, 2:35:00 PM ET)");
    expect(exitAlert({ ...signal, showPrices: false, gainPercent: 2, reason: "signal" }).body).not.toContain("187.50");
  });
});
