import { DatabaseAPI } from "../../../shared/services/db-api";
import StockInfoRepository from "../../../shared/services/repos/stock-info-repository";
import { IRange } from "../../../types/back-test-types";
import { IStockInfoEntity } from "../../../types/entity-types";

jest.mock("../../../shared/services/db-api");

describe("StockInfoRepository", () => {
  describe("getStocksByDate", () => {
    it("should get stocks by date", async () => {
      const date = new Date(2021, 5, 1);
      const DEFAULT_MIN = 200 * 10 ** 6;
      const dateString = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
      const query = `select * from stockinfo where marketCap > ${DEFAULT_MIN} and earningsdate= ${dateString}`;
      const mockData: IStockInfoEntity[] = [
        { symbol: "AAPL", market_cap: 210 * 10 ** 6, labels: "" },
        { symbol: "GOOGL", market_cap: 220 * 10 ** 6, labels: "" },
      ];
      (DatabaseAPI.runQuery as jest.Mock).mockResolvedValue(mockData);

      const result = await StockInfoRepository.getStocksByDate(date);

      expect(DatabaseAPI.runQuery).toHaveBeenCalledWith(query);
      expect(result).toEqual(mockData);
    });
  });

  describe("getStocks", () => {
    it("should get stocks within a range", async () => {
      const range: IRange = { start: 200 * 10 ** 6, end: 300 * 10 ** 6 };
      const query = `select * from stockinfo where marketCap >= ${range.start} and marketCap <= ${range.end}`;
      const mockData: string[] = ["AAPL", "GOOGL"];
      (DatabaseAPI.runQuery as jest.Mock).mockResolvedValue(mockData);

      const result = await StockInfoRepository.getStocks(range);

      expect(DatabaseAPI.runQuery).toHaveBeenCalledWith(query);
      expect(result).toEqual(mockData);
    });

    it("should get stocks with only end range", async () => {
      const range: IRange = { end: 300 * 10 ** 6 };
      const query = `select * from stockinfo where marketCap <= ${range.end}`;
      const mockData: string[] = ["AAPL", "GOOGL"];
      (DatabaseAPI.runQuery as jest.Mock).mockResolvedValue(mockData);

      const result = await StockInfoRepository.getStocks(range);

      expect(DatabaseAPI.runQuery).toHaveBeenCalledWith(query);
      expect(result).toEqual(mockData);
    });

    it("should get stocks with only start range", async () => {
      const range: IRange = { start: 200 * 10 ** 6 };
      const query = `select * from stockinfo where marketCap >= ${range.start}`;
      const mockData: string[] = ["AAPL", "GOOGL"];
      (DatabaseAPI.runQuery as jest.Mock).mockResolvedValue(mockData);

      const result = await StockInfoRepository.getStocks(range);

      expect(DatabaseAPI.runQuery).toHaveBeenCalledWith(query);
      expect(result).toEqual(mockData);
    });
  });
});
