/**
 * npm run load-test:schema
 *
 * (Re)creates the load-test schema with the same tables as DB_SCHEMA_NAME
 * (structure only, no rows), using mysqldump and mysql from your PATH.
 */
import { ChildProcess, spawn } from "child_process";
import { assertLoadTestSchema, LOAD_TEST_SCHEMA } from "./common";

const { DB_HOST, DB_USER, DB_PASSWORD, DB_SCHEMA_NAME } = process.env;

/** Starts a MySQL client tool; the password goes in its environment, not on the command line. */
const start = (cmd: string, args: string[], stdin: "ignore" | "pipe") =>
  spawn(cmd, ["-h", DB_HOST || "localhost", "-u", DB_USER || "", ...args], {
    env: { ...process.env, MYSQL_PWD: DB_PASSWORD || "" },
    stdio: [stdin, stdin === "pipe" ? "inherit" : "pipe", "inherit"],
  });

const exited = (child: ChildProcess, name: string) =>
  new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${name} exited with ${code}`))));
  });

const main = async () => {
  assertLoadTestSchema(LOAD_TEST_SCHEMA);
  if (!DB_SCHEMA_NAME || DB_SCHEMA_NAME === LOAD_TEST_SCHEMA) {
    throw new Error("Set DB_SCHEMA_NAME in .env to the app's real schema; its tables are copied.");
  }
  console.log(`Creating ${LOAD_TEST_SCHEMA} with the tables of ${DB_SCHEMA_NAME} (no rows)…`);

  const reset = start(
    "mysql",
    ["-e", `DROP DATABASE IF EXISTS \`${LOAD_TEST_SCHEMA}\`; CREATE DATABASE \`${LOAD_TEST_SCHEMA}\`;`],
    "ignore",
  );
  reset.stdout?.resume();
  await exited(reset, "mysql");

  const dump = start("mysqldump", ["--no-data", "--skip-add-drop-table", DB_SCHEMA_NAME], "ignore");
  const load = start("mysql", [LOAD_TEST_SCHEMA], "pipe");
  dump.stdout!.pipe(load.stdin!);
  await Promise.all([exited(dump, "mysqldump"), exited(load, "mysql")]);
  console.log("Done.");
};

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
