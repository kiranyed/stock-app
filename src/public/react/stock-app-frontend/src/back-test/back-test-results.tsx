import * as React from "react";

type Gain = { tradeNum: number; total: number; name: string };

interface IProps {
  results: { [key: string]: Gain };
  startTime?: Date | null;
  endTime?: Date | null;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function Results(props: IProps) {
  const { results, startTime, endTime } = props;

  // const hasResults = Object.keys(results).some(
  //   (key) => results[key].tradeNum > 0
  // );

  //if (!hasResults) return null;

  return (
    <div className="results">
      {Object.keys(results).map((key, idx) => {
        const res = results[key];
        const positive = res.total > 0;

        return (
          <div key={idx} className="result-card">
            <h3>
              Results for {res.name}
              {startTime && endTime
                ? `, ran from ${formatDate(startTime)} to ${formatDate(endTime)}`
                : ""}
            </h3>
            <div className="stats">
              <div className={positive ? "positive" : "negative"}>
                Total gain: {positive ? `+${res.total}%` : `${res.total}%`}
              </div>
              <div>Number of trades: {res.tradeNum}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
