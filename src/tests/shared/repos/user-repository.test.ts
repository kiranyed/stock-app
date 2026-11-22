import { DatabaseAPI } from "../../../shared/services/db-api";
import UserRepository from "../../../shared/services/repos/user-repository";

jest.mock("../../../shared/services/db-api");

describe("UserRepository", () => {
  describe("createCredentials", () => {
    it("should create user credentials", async () => {
      const username = "testuser";
      const password = "testpassword";
      const query = `insert into user (username, password) values ('${username}', '${password}')`;

      await UserRepository.createUser(username, password);

      expect(DatabaseAPI.runInsertQuery).toHaveBeenCalledWith(query);
    });
  });

  describe("getPassAndIdForUser", () => {
    it("should get password and id for a user", async () => {
      const username = "testuser";
      const query = `select password, id from user where username='${username}'`;
      const mockData = [{ password: "testpassword", id: 1 }];
      (DatabaseAPI.runQuery as jest.Mock).mockResolvedValue(mockData);

      const result = await UserRepository.getPassAndIdForUser(username);

      expect(DatabaseAPI.runQuery).toHaveBeenCalledWith(query);
      expect(result).toEqual(mockData);
    });
  });
});
