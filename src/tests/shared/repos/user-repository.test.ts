import { DatabaseAPI } from "../../../shared/services/db-api";
import UserRepository from "../../../shared/services/repos/user-repository";

jest.mock("../../../shared/services/db-api");

const EVIL = "x'; drop table user; --";

describe("UserRepository", () => {
  it("creates a user with placeholders and returns the id", async () => {
    (DatabaseAPI.insert as jest.Mock).mockResolvedValue(5);
    await expect(UserRepository.createUser(EVIL, "hash")).resolves.toEqual({ insertId: 5 });
    expect(DatabaseAPI.insert).toHaveBeenCalledWith("insert into user (username, password) values (?, ?)", [EVIL, "hash"]);
  });

  it("looks a user up by name with a placeholder (the login query)", async () => {
    (DatabaseAPI.query as jest.Mock).mockResolvedValue([{ password: "hash", id: 1 }]);
    await expect(UserRepository.getPassAndIdForUser(EVIL)).resolves.toEqual([{ password: "hash", id: 1 }]);
    expect(DatabaseAPI.query).toHaveBeenCalledWith("select password, id from user where username = ?", [EVIL]);
  });

  it("finds users by id, by name, or the first few, never reading the password", async () => {
    (DatabaseAPI.query as jest.Mock).mockResolvedValue([]);
    await UserRepository.findUsers({ id: 3 });
    expect(DatabaseAPI.query).toHaveBeenLastCalledWith("select id, username from user where id = ?", [3]);
    await UserRepository.findUsers({ username: EVIL });
    expect(DatabaseAPI.query).toHaveBeenLastCalledWith("select id, username from user where username = ?", [EVIL]);
    await UserRepository.findUsers({}, 2);
    expect(DatabaseAPI.query).toHaveBeenLastCalledWith("select id, username from user order by id limit ?", [2]);
  });
});
