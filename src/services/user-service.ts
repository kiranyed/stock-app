import * as bcrypt from "bcrypt";
import * as jwt from "jsonwebtoken";
import Error400 from "../errors/error-400";
import Error401 from "../errors/error-401";
import Error404 from "../errors/error-404";
import UserRepository from "../shared/services/repos/user-repository";
import { getJwtSecret } from "../middleware/auth-middleware";
import { parseId } from "./parse";

const SALT_ROUNDS = 10;
const TOKEN_LIFETIME = "24h";

/** Sign-up and login. */
export class UserService {
  static async register(username: unknown, password: unknown): Promise<{ id: number; username: string }> {
    if (!username) throw new Error400("must enter username");
    if (typeof username !== "string") throw new Error400("username must be a string");
    if (!username.match(/^\w+$/)) {
      throw new Error400("username must consist only of alphanumeric characters");
    }
    if (!password) throw new Error400("must enter password");
    if (typeof password !== "string") throw new Error400("password must be a string");
    if (!password.match(/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/)) {
      throw new Error400("password must be Minimum eight characters, at least one letter and one number");
    }
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const { insertId } = await UserRepository.createUser(username, hash);
    return { id: insertId, username };
  }

  /** Checks the password and returns a signed token (24 hours) for the user. */
  static async login(username: unknown, password: unknown): Promise<{ token: string; user: string }> {
    if (!username) throw new Error400("Must enter a username");
    if (typeof username !== "string") throw new Error400("Username must be a string");
    if (!password) throw new Error400("Must enter a password");
    if (typeof password !== "string") throw new Error400("Password must be a string");

    const [row] = await UserRepository.getPassAndIdForUser(username);
    if (!row?.password) throw new Error404("No user named " + username + " found");
    if (!(await bcrypt.compare(password, row.password))) throw new Error401("Invalid password");

    const token = jwt.sign({ sub: row.id, role: "user" }, getJwtSecret(), { expiresIn: TOKEN_LIFETIME });
    return { token, user: username };
  }

  /**
   * The user a local client with no login (the MCP server) acts for: the configured id or
   * username, or, with neither, the install's only user. A self-hosted copy has one user
   * (REFACTOR.md §6), so the usual setup needs no configuration.
   */
  static async resolveLocalUser(config: { id?: string; username?: string }): Promise<{ id: number; username: string }> {
    const id = config.id?.trim();
    const username = config.username?.trim();
    const pick = (row: { id: number; username: string }) => ({ id: row.id, username: row.username });
    if (id) {
      const [row] = await UserRepository.findUsers({ id: parseId(id, "MCP_USER_ID") });
      if (!row) throw new Error404(`No user with id ${id}`);
      return pick(row);
    }
    if (username) {
      const [row] = await UserRepository.findUsers({ username });
      if (!row) throw new Error404(`No user named ${username}`);
      return pick(row);
    }
    const rows = await UserRepository.findUsers({}, 2);
    if (rows.length === 1) return pick(rows[0]);
    throw new Error400(
      rows.length
        ? "This install has more than one user: set MCP_USER_ID or MCP_USERNAME to choose one"
        : "This install has no users yet: sign up in the app first",
    );
  }
}
