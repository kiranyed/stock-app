import { User } from "../../../types/entity-types";
import { DatabaseAPI } from "../db-api";

/** `user` rows. Every value goes through a placeholder. */
export default class UserRepository {
  public static async createUser(username: string, passwordHash: string): Promise<{ insertId: number }> {
    const insertId = await DatabaseAPI.insert("insert into user (username, password) values (?, ?)", [
      username,
      passwordHash,
    ]);
    return { insertId };
  }

  public static getPassAndIdForUser(username: string) {
    return DatabaseAPI.query<User>("select password, id from user where username = ?", [username]);
  }

  /** Users matching `id` or `username`, or (neither given) the first `limit` users; never the password. */
  public static findUsers(by: { id?: number; username?: string }, limit = 2) {
    type Row = { id: number; username: string };
    if (by.id !== undefined) return DatabaseAPI.query<Row>("select id, username from user where id = ?", [by.id]);
    if (by.username !== undefined) {
      return DatabaseAPI.query<Row>("select id, username from user where username = ?", [by.username]);
    }
    return DatabaseAPI.query<Row>("select id, username from user order by id limit ?", [limit]);
  }
}
