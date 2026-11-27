import { TransactionService } from "../../services/transaction-service";
import TransactionRepository from "../../shared/services/repos/transaction-repository";

jest.mock("../../shared/services/repos/transaction-repository");

describe("TransactionService.list", () => {
  it("asks for the user's rows and keeps the run id, converting decimals to numbers", async () => {
    (TransactionRepository.getOwnedTransactions as jest.Mock).mockResolvedValue([
      { run_id: 4, symbol: "AAPL", datetime: 1000, net_gain: "25.50", net_percent_gain: "12.5000", long: 1 },
    ]);
    await expect(TransactionService.list(7, "simulation", [4], 0)).resolves.toEqual([
      expect.objectContaining({ runId: 4, symbol: "AAPL", datetime: 1000, netGain: 25.5, netPercentGain: 12.5, long: true }),
    ]);
    expect(TransactionRepository.getOwnedTransactions).toHaveBeenCalledWith("simulation", [4], 7, 0);
  });
});
