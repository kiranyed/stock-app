import * as fs from "fs";

export class TradeLogger {
  private static readonly outputDir = "outputFolder";
  private static readonly debugMode = process.env.DEBUG === "true" || process.env.DEBUG === "1";

  private static formatDateForFileName(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
  }

  private static ensureOutputDir() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  private static strategyLogPath(name: string) {
    return `${this.outputDir}/${name}.log`;
  }

  public static initializeStrategyLog(name: string) {
    this.ensureOutputDir();
    fs.writeFile(this.strategyLogPath(name), "", { flag: "a+" }, (err) => {
      if (err) {
        console.log(err);
      }
    });
  }

  public static log(text: string) {
    console.log(text);
  }

  public static debug(text: string) {
    if (this.debugMode) {
      console.log(`[DEBUG] ${text}`);
    }
  }

  public static logToStrategy(text: string, strategyName: string) {
    this.initializeStrategyLog(strategyName);
    const fileName = this.strategyLogPath(strategyName);
    fs.writeFile(fileName, text + "\n", { flag: "a+" }, (err) => {
      if (err) {
        console.log(err);
      }
    });
  }

  public static renameStrategyLog(id: string) {
    this.ensureOutputDir();
    const source = this.strategyLogPath(id);
    if (!fs.existsSync(source)) {
      return;
    }
    const endedAt = this.formatDateForFileName(new Date());
    fs.rename(
      source,
      this.strategyLogPath(`${id}_ended_${endedAt}`),
      (err) => {
        if (err) {
          console.log(err);
        }
      },
    );
  }

  public static logError(error: string | unknown, id: string) {
    this.logToStrategy("Error: " + error + "\n", id + "-errors");
  }
}
