import { DatabaseAPI } from "../../../shared/services/db-api";
import StockGroupRepository from "../../../shared/services/repos/stock-group-repository";

jest.mock("../../../shared/services/db-api");

describe("StockGroupRepository", () => {
  describe("createGroup", () => {
    it("should create a group and return the result", async () => {
      const mockName = "Tech Stocks";
      const mockSymbols = ["AAPL", "GOOGL"];
      const mockUserId = 1;
      const mockResponse = { insertId: 123 };
      (DatabaseAPI.runQuery as jest.Mock).mockResolvedValue(mockResponse);

      const result = await StockGroupRepository.createGroup(
        mockName,
        mockSymbols,
        mockUserId,
      );

      expect(DatabaseAPI.runQuery).toHaveBeenCalledWith(expect.any(String));
      expect(result).toEqual(mockResponse);
    });

    it("should throw an error if creating group fails", async () => {
      const mockName = "Tech Stocks";
      const mockSymbols = ["AAPL", "GOOGL"];
      const mockUserId = 1;
      const mockError = new Error("Creating group failed");
      (DatabaseAPI.runQuery as jest.Mock).mockRejectedValue(mockError);

      await expect(
        StockGroupRepository.createGroup(mockName, mockSymbols, mockUserId),
      ).rejects.toThrow(mockError);
    });
  });

  describe("saveGroup", () => {
    it("should save a group and return the result", async () => {
      const mockName = "Tech Stocks";
      const mockSymbols = ["AAPL", "GOOGL"];
      const mockId = 123;
      const mockResponse = { affectedRows: 1 };
      (DatabaseAPI.runQuery as jest.Mock).mockResolvedValue(mockResponse);

      const result = await StockGroupRepository.saveGroup(
        mockName,
        mockSymbols,
        mockId,
      );

      expect(DatabaseAPI.runQuery).toHaveBeenCalledWith(expect.any(String));
      expect(result).toEqual(mockResponse);
    });

    it("should throw an error if saving group fails", async () => {
      const mockName = "Tech Stocks";
      const mockSymbols = ["AAPL", "GOOGL"];
      const mockId = 123;
      const mockError = new Error("Saving group failed");
      (DatabaseAPI.runQuery as jest.Mock).mockRejectedValue(mockError);

      await expect(
        StockGroupRepository.saveGroup(mockName, mockSymbols, mockId),
      ).rejects.toThrow(mockError);
    });
  });

  describe("deleteGroup", () => {
    it("should delete a group and return the result", async () => {
      const mockId = "123";
      const mockResponse = { affectedRows: 1 };
      (DatabaseAPI.runQuery as jest.Mock).mockResolvedValue(mockResponse);

      const result = await StockGroupRepository.deleteGroup(mockId);

      expect(DatabaseAPI.runQuery).toHaveBeenCalledWith(expect.any(String));
      expect(result).toEqual(mockResponse);
    });

    it("should throw an error if deleting group fails", async () => {
      const mockId = "123";
      const mockError = new Error("Deleting group failed");
      (DatabaseAPI.runQuery as jest.Mock).mockRejectedValue(mockError);

      await expect(StockGroupRepository.deleteGroup(mockId)).rejects.toThrow(
        mockError,
      );
    });
  });

  describe("deleteGroups", () => {
    it("should delete multiple groups and return the result", async () => {
      const mockIds = ["123", "456"];
      const mockResponse = { affectedRows: 2 };
      (DatabaseAPI.runQuery as jest.Mock).mockResolvedValue(mockResponse);

      const result = await StockGroupRepository.deleteGroups(mockIds);

      expect(DatabaseAPI.runQuery).toHaveBeenCalledWith(expect.any(String));
      expect(result).toEqual(mockResponse);
    });

    it("should throw an error if deleting multiple groups fails", async () => {
      const mockIds = ["123", "456"];
      const mockError = new Error("Deleting multiple groups failed");
      (DatabaseAPI.runQuery as jest.Mock).mockRejectedValue(mockError);

      await expect(StockGroupRepository.deleteGroups(mockIds)).rejects.toThrow(
        mockError,
      );
    });
  });
});
