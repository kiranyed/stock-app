import * as dotenv from "dotenv";
import { DatabaseAPI } from "../../shared/services/db-api";
import UserRepository from "../../shared/services/repos/user-repository";
import { StrategyService } from "../../services/strategy-service";
import { SCREENERS_VERSION } from "../../services/strategy-schema";

// The versioned screeners format (src/services/strategy-schema.ts) against real MySQL, inside a
// rolled-back transaction: what's stored, and how an older row reads back.
describe("Integration - strategy screeners format", () => {
  let user = -1;
  const filter = (varName: string, operator: string) => ({ varName, timeAgo: "1", compareVal: "1", operator });
  const screener = (extra: object = {}) => ({
    buySellFilters: {
      enter: { filters: [filter("percentchange", ">")], connectors: ["AND"] },
      exit: { filters: [filter("percentchange", "<")], connectors: [] },
    },
    ...extra,
  });
  const input = (screeners: object[]) => ({ name: `fmt${Date.now()}`, description: "", period: 1440, screeners });
  const stored = async (id: number) =>
    (
      await DatabaseAPI.query<{ screeners: { id?: string }[]; screeners_version: number }>(
        "select screeners, screeners_version from strategy where id = ?",
        [id],
      )
    )[0];

  beforeAll(async () => {
    dotenv.config();
    await DatabaseAPI.createConnection();
    await DatabaseAPI.startTransaction();
    ({ insertId: user } = await UserRepository.createUser(`fmt${Date.now()}`, "x"));
  }, 60000);

  afterAll(async () => {
    try {
      await DatabaseAPI.rollbackTransaction();
    } finally {
      await DatabaseAPI.closeConnection();
    }
  });

  it("stores a new strategy in the current format, each screener with its own id", async () => {
    const { id } = await StrategyService.create(user, input([screener(), screener()]));
    const row = await stored(id);
    expect(row.screeners_version).toBe(SCREENERS_VERSION);
    const ids = row.screeners.map((s) => s.id);
    expect(ids).toEqual([expect.stringMatching(/^scr_/), expect.stringMatching(/^scr_/)]);
    expect(new Set(ids).size).toBe(2);
  });

  it("keeps a screener's id when the strategy is edited, and gives an added one a new id", async () => {
    const { id } = await StrategyService.create(user, input([screener()]));
    const [{ screeners }] = await StrategyService.list(user).then((all) => all.filter((s) => s.id === id));
    const kept = screeners[0].id;
    await StrategyService.update(user, id, input([screener(), screener({ id: kept })]));
    const ids = (await stored(id)).screeners.map((s) => s.id);
    expect(ids[1]).toBe(kept);
    expect(ids[0]).toMatch(/^scr_/);
    expect(ids[0]).not.toBe(kept);
  });

  it("reads a version-1 row (saved before ids) with s1, s2..., and stores ids on its next save", async () => {
    const id = await DatabaseAPI.insert(
      "insert into strategy (name, screeners, description, date_added, period, user_id) values (?, ?, '', 0, 1440, ?)",
      [`v1${Date.now()}`, JSON.stringify([screener(), screener()]), user],
    );
    expect((await stored(id)).screeners_version).toBe(1);
    const [old] = (await StrategyService.list(user)).filter((s) => s.id === id);
    expect(old.screeners.map((s) => s.id)).toEqual(["s1", "s2"]);

    await StrategyService.update(user, id, { ...old, description: "edited" });
    const row = await stored(id);
    expect(row.screeners_version).toBe(SCREENERS_VERSION);
    expect(row.screeners.map((s) => s.id)).toEqual(["s1", "s2"]);
  });
});
