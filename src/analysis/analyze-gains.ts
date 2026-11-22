import { CONSTANTS } from "../shared/constants";
import { StockDataUtil } from "../shared/utilities/stock-data-util";
import { ICandleData } from "../types/back-test-types";

interface IGainPoint {
  time: number;
  gain: number;
}

interface IMarker {
  time: number;
  price: number;
}

type Success = {
  enterPrice: number;
  exitPrice: number;
  symbol: string;
  gain: number;
};

type Failure = { symbol: string; gain: number };

interface IGain {
  symbol: string;
  gain: number;
  time: number;
  lowestGainPoint?: IGainPoint;
  highestGainPoint?: IGainPoint;
  enteredTime?: number;
  test?: boolean;
}

export class GainsAnalyzer {
  gains: IGain[];
  candleData: { [key: string]: ICandleData };
  startTime = 0;
  endTime = 0;
  markers: { [key: string]: IMarker | null } = {};
  successes: Success[] = [];
  failures: Failure[] = [];
  constructor(gains: IGain[], candleData = {}) {
    this.gains = gains;
    this.candleData = candleData;
  }

  setStartTime(time: number) {
    this.startTime = time;
  }

  setEndTime(time: number) {
    this.endTime = time;
  }

  runAnalyzer() {
    for (const key of Object.keys(this.candleData)) {
      const candles = this.candleData[key].candles;
      for (let j = 0; j < candles.length; j++) {
        if (
          StockDataUtil.inBounds(candles[j]) &&
          StockDataUtil.getTime(candles[j]) > 571
        ) {
          if (!this.markers[key]) {
            if (candles[j - 2].open / candles[j].open > 1.002) {
              this.markers[key] = {
                price: candles[j].open,
                time: StockDataUtil.getTime(candles[j]),
              };
            }
          } else {
            const gain = candles[j].open / this.markers[key].price - 1;
            if (gain > 0.002) {
              this.successes.push({
                symbol: key,
                enterPrice: this.markers[key].price,
                exitPrice: candles[j].open,
                gain,
              });
              this.markers[key] = null;
            }
          }
        } else if (
          StockDataUtil.getTime(candles[j]) > CONSTANTS.MINUTE_BEFORE_CLOSE_TIME
        ) {
          if (this.markers[key]) {
            const gain = candles[j].open / this.markers[key].price - 1;
            this.failures.push({ gain, symbol: key });
          }
          this.markers[key] = null;
        }
      }
    }
    const winPct =
      (this.successes.length / (this.successes.length + this.failures.length)) *
      CONSTANTS.HUNDRED;
    console.log("Win percent: " + winPct);
    this.checkLowestGainPoint(); // Call the method to ensure it is used
    console.log("Win percent: " + winPct);
  }

  checkLowestGainPoint() {
    const losers = new Array<IGain>();
    const winners = new Array<IGain>();
    for (const gain of this.gains) {
      if (gain.gain > 1) {
        winners.push(gain);
      } else {
        losers.push(gain);
      }
    }
    console.log("Lowest gain points of the winners");
    for (const winner of winners) {
      if (
        winner.highestGainPoint &&
        winner.lowestGainPoint &&
        winner.enteredTime
      ) {
        // console.log('Gain: ' + winner.gain.toFixed(4) + ', lowestgainPoint: ' + winner.lowestGainPoint.gain.toFixed(4)
        // + ', at time: ' + winner.lowestGainPoint.time + ', entered at time: ' + winner.enteredTime);
      }
    }
  }

  testPassed() {
    const losers = new Array<IGain>();
    const winners = new Array<IGain>();
    for (const gain of this.gains) {
      if (gain.gain > 1) {
        winners.push(gain);
      } else {
        losers.push(gain);
      }
    }
    const blah = new Array<IGain>();
    const blah2 = new Array<IGain>();
    for (const winner of winners) {
      if (winner.test) {
        blah.push(winner);
      }
    }
    for (const loser of losers) {
      if (loser.test) {
        blah2.push(loser);
      }
    }
  }

  log = (winners: IGain[], losers: IGain[], hit1: number, hit2: number) => {
    console.log(
      "Hit " + hit1 + " stop losses of " + winners.length + " total winners",
    );
    console.log("Highest gains, and resultant gains:");
    for (const gain of winners) {
      if (gain.highestGainPoint) {
        console.log(
          "highest (gain and time):" +
            gain.highestGainPoint.gain.toFixed(4) +
            ", " +
            (gain.highestGainPoint.time - 570) +
            ", resultant: " +
            gain.gain.toFixed(4),
          " check hit: " + gain.test,
        );
        console.log("Listing trends");
      }
    }

    console.log(
      "Hit " + hit2 + " stop losses of " + losers.length + " total losers",
    );
    console.log("Lowest losses: ");
    for (const loser of losers) {
      console.log(
        "lowest (loss and time): " +
          (loser.lowestGainPoint?.gain?.toFixed(4) ?? "N/A") +
          ", " +
          (loser.lowestGainPoint ? loser.lowestGainPoint.time - 570 : "N/A") +
          ", resultant: " +
          loser.gain.toFixed(4),
      );
    }
  };
}
