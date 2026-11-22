import * as supertest from "supertest";
import * as dotenv from "dotenv";
import { HttpStatusCode } from "axios";
import { IStockGroup } from "../../types/entity-types";
import StockGroupRepository from "../../shared/services/repos/stock-group-repository";
import { SchwabAPI } from "../../shared/services/trading-api";
import { DatabaseAPI } from "../../shared/services/db-api";
import AppServer from "../../startup/app-server";

const POST = "post";
const DELETE = "delete";

describe("Integration - Group", () => {
  let agent: ReturnType<typeof supertest.agent>;
  let userToken = "";

  const username = `group${Date.now()}`;
  const password = "Passw0rd9";

  const group: IStockGroup = {
    name: Math.random().toString(36).slice(2),
    symbols: ["AAPL", "MSFT", "AMZN", "GOOGL", "META", "NVDA", "TSLA"],
    id: -1,
  };

  const group2: IStockGroup = {
    name: Math.random().toString(36).slice(2),
    symbols: ["META"],
    id: -1,
  };

  const request = (url: string, method: string, payload?: string | object) => {
    switch (method) {
      case POST:
        return agent.post(url).set("x-access-token", userToken).send(payload);
      case DELETE:
        return agent.delete(url).set("x-access-token", userToken);
      default:
        return agent.get(url).set("x-access-token", userToken);
    }
  };

  beforeAll(async () => {
    dotenv.config();
    const appServer = new AppServer();
    agent = supertest.agent(appServer.getExpressInstance());
    await SchwabAPI.initialize();
    await DatabaseAPI.createConnection();
    await DatabaseAPI.startTransaction();

    const reg = await agent.post("/user/register").send({ username, password });
    expect(reg.status).toBe(HttpStatusCode.Ok);
    const login = await agent.post("/user/login").send({ username, password });
    expect(login.status).toBe(HttpStatusCode.Ok);
    userToken = login.body.token;
  });

  it("creates groups", async () => {
    const grpResp = await request("/api/group", POST, group);
    group.id = grpResp.body.id;
    const [storedGrp] = await StockGroupRepository.getGroupById(group.id);
    expect(storedGrp).toBeTruthy();

    const grpResp2 = await request("/api/group", POST, group2);
    group2.id = grpResp2.body.id;
    const [storedGrp2] = await StockGroupRepository.getGroupById(group2.id);
    expect(storedGrp2).toBeTruthy();
  });

  it("deletes group", async () => {
    const [grp] = await StockGroupRepository.getGroupById(group.id);
    expect(grp).toBeTruthy();
    await request("/api/group/" + group.id, DELETE);
    const remainingGroups = await StockGroupRepository.getGroupById(group.id);
    expect(remainingGroups.length).toBe(0);
  });

  afterAll(async () => {
    await DatabaseAPI.rollbackTransaction();
    await DatabaseAPI.closeConnection();
  });
});
