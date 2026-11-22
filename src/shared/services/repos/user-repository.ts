import { User } from "../../../types/entity-types";
import { DatabaseAPI } from "../db-api";

export default class UserRepository {
  private static runQuery<T = User>(query: string) {
    return DatabaseAPI.runQuery<T>(query);
  }
  private static runInsertQuery(query: string) {
    return DatabaseAPI.runInsertQuery(query);
  }

  public static createUser(
    username: string,
    password: string,
  ): Promise<{ insertId: number }> {
    const query =
      "insert into user (username, password) values ('" +
      username +
      "', '" +
      password +
      "')";
    return this.runInsertQuery(query);
  }

  public static getPassAndIdForUser(username: string) {
    const query =
      "select password, id from user where username='" + username + "'";
    return this.runQuery(query);
  }
}
