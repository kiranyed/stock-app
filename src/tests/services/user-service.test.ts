import * as bcrypt from "bcrypt";
import * as jwt from "jsonwebtoken";
import Error400 from "../../errors/error-400";
import Error401 from "../../errors/error-401";
import Error404 from "../../errors/error-404";
import { UserService } from "../../services/user-service";
import UserRepository from "../../shared/services/repos/user-repository";

jest.mock("../../shared/services/repos/user-repository");

const repo = UserRepository as jest.Mocked<typeof UserRepository>;

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret";
});
beforeEach(() => jest.clearAllMocks());

describe("UserService.register", () => {
  it("stores a bcrypt hash, never the password", async () => {
    repo.createUser.mockResolvedValue({ insertId: 4 });
    await expect(UserService.register("alice_1", "Passw0rd9")).resolves.toEqual({ id: 4, username: "alice_1" });
    const [name, hash] = repo.createUser.mock.calls[0];
    expect(name).toBe("alice_1");
    expect(hash).not.toBe("Passw0rd9");
    expect(await bcrypt.compare("Passw0rd9", hash)).toBe(true);
  });

  it.each([
    [undefined, "Passw0rd9", /must enter username/],
    ["bad name", "Passw0rd9", /alphanumeric/],
    ["x'; drop table user; --", "Passw0rd9", /alphanumeric/],
    ["alice", undefined, /must enter password/],
    ["alice", "short1", /eight characters/],
    ["alice", "nodigitshere", /eight characters/],
  ])("rejects %p / %p", async (username, password, message) => {
    await expect(UserService.register(username, password)).rejects.toThrow(message);
    expect(repo.createUser).not.toHaveBeenCalled();
  });
});

describe("UserService.login", () => {
  it("returns a token naming the user's id", async () => {
    repo.getPassAndIdForUser.mockResolvedValue([{ id: 9, password: await bcrypt.hash("Passw0rd9", 4) }] as never);
    const { token, user } = await UserService.login("alice", "Passw0rd9");
    expect(user).toBe("alice");
    expect((jwt.verify(token, "test-secret") as jwt.JwtPayload).sub).toBe(9);
  });

  it("refuses a wrong password, an unknown user and bad input", async () => {
    repo.getPassAndIdForUser.mockResolvedValueOnce([{ id: 9, password: await bcrypt.hash("Passw0rd9", 4) }] as never);
    await expect(UserService.login("alice", "wrong1234")).rejects.toBeInstanceOf(Error401);
    repo.getPassAndIdForUser.mockResolvedValueOnce([]);
    await expect(UserService.login("nobody", "Passw0rd9")).rejects.toBeInstanceOf(Error404);
    await expect(UserService.login({ $ne: "" }, "x")).rejects.toBeInstanceOf(Error400);
  });

  it("passes an injection attempt to the repository as plain data", async () => {
    repo.getPassAndIdForUser.mockResolvedValue([]);
    await expect(UserService.login("x' or '1'='1", "anything1")).rejects.toBeInstanceOf(Error404);
    expect(repo.getPassAndIdForUser).toHaveBeenCalledWith("x' or '1'='1");
  });
});

describe("UserService.resolveLocalUser", () => {
  const alice = { id: 1, username: "alice" };

  it("uses the only user when nothing is configured", async () => {
    repo.findUsers.mockResolvedValue([alice] as never);
    await expect(UserService.resolveLocalUser({})).resolves.toEqual(alice);
    expect(repo.findUsers).toHaveBeenCalledWith({}, 2);
  });

  it("refuses to guess when there are several users", async () => {
    repo.findUsers.mockResolvedValue([alice, { id: 2, username: "bob" }] as never);
    await expect(UserService.resolveLocalUser({})).rejects.toThrow(/MCP_USER_ID or MCP_USERNAME/);
  });

  it("says to sign up when there are no users", async () => {
    repo.findUsers.mockResolvedValue([] as never);
    await expect(UserService.resolveLocalUser({})).rejects.toThrow(/no users yet/);
  });

  it("uses the configured id", async () => {
    repo.findUsers.mockResolvedValue([alice] as never);
    await expect(UserService.resolveLocalUser({ id: " 1 ", username: "ignored" })).resolves.toEqual(alice);
    expect(repo.findUsers).toHaveBeenCalledWith({ id: 1 });
  });

  it("rejects a malformed or unknown id", async () => {
    await expect(UserService.resolveLocalUser({ id: "abc" })).rejects.toThrow(Error400);
    repo.findUsers.mockResolvedValue([] as never);
    await expect(UserService.resolveLocalUser({ id: "9" })).rejects.toThrow(Error404);
  });

  it("uses the configured username", async () => {
    repo.findUsers.mockResolvedValue([alice] as never);
    await expect(UserService.resolveLocalUser({ username: "alice" })).resolves.toEqual(alice);
    expect(repo.findUsers).toHaveBeenCalledWith({ username: "alice" });
    repo.findUsers.mockResolvedValue([] as never);
    await expect(UserService.resolveLocalUser({ username: "zed" })).rejects.toThrow(/No user named zed/);
  });
});
