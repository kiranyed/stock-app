import * as dotenv from "dotenv";
import { DatabaseAPI } from "../../shared/services/db-api";
import PaperPositionRepository from "../../shared/services/repos/paper-position-repository";
import RunRepository from "../../shared/services/repos/run-repository";

// paper_position (db/paper-position.sql) against real MySQL, inside a rolled-back transaction.
// Run ids far above any real one, so nothing else's positions are touched.
describe("Integration - paper positions", () => {
  const RUN = 2_000_000_001;
  const OTHER = 2_000_000_002;
  const position = (fields: object = {}) => ({
    run_id: RUN,
    symbol: "AAPL",
    is_long: true,
    entry_price: 187.123456,
    entry_time: 1_795_446_000_000,
    quantity: 8,
    screener_key: "a".repeat(64),
    ...fields,
  });

  beforeAll(async () => {
    dotenv.config();
    await DatabaseAPI.createConnection();
    await DatabaseAPI.startTransaction();
  }, 60000);

  afterAll(async () => {
    try {
      await DatabaseAPI.rollbackTransaction();
    } finally {
      await DatabaseAPI.closeConnection();
    }
  });

  it("stores open positions by run, exactly as given", async () => {
    await PaperPositionRepository.open(position());
    await PaperPositionRepository.open(position({ symbol: "TSLA", is_long: false }));
    await PaperPositionRepository.open(position({ run_id: OTHER }));
    const byRun = await PaperPositionRepository.forRuns([RUN, OTHER]);
    expect(byRun.get(RUN)).toEqual([position(), position({ symbol: "TSLA", is_long: false })]);
    expect(byRun.get(OTHER)).toEqual([position({ run_id: OTHER })]);
  });

  it("a second entry in the same symbol replaces the first", async () => {
    await PaperPositionRepository.open(position({ is_long: false, entry_price: 190, quantity: 7, screener_key: "b".repeat(64) }));
    const [aapl] = (await PaperPositionRepository.forRuns([RUN])).get(RUN)!;
    expect(aapl).toEqual(position({ is_long: false, entry_price: 190, quantity: 7, screener_key: "b".repeat(64) }));
  });

  it("closing deletes one position; ending runs deletes all of theirs", async () => {
    await PaperPositionRepository.close(RUN, "TSLA");
    expect((await PaperPositionRepository.forRuns([RUN])).get(RUN)!.map((p) => p.symbol)).toEqual(["AAPL"]);
    await RunRepository.endRuns([RUN, OTHER]);
    expect((await PaperPositionRepository.forRuns([RUN, OTHER])).size).toBe(0);
  });
});
