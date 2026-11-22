import { ILiveStockScreenerJob } from "../types/data-processing-types";
import { Analysis } from "./analysis";

export class AnalysisLive extends Analysis implements ILiveStockScreenerJob {
  id: number = 0;
  getId() {
    return this.id;
  }

  setId(id: number) {
    this.id = id;
  }
}
