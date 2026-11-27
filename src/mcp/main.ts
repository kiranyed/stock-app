/**
 * npm run --silent mcp
 *
 * The MCP server on stdio, for a local client such as Claude Code or Claude Desktop. It is its
 * own process: it connects to the database in .env and acts for one user of this install
 * (MCP_USER_ID or MCP_USERNAME, or the only user when neither is set). See README "MCP server".
 *
 * stdout carries the protocol, so everything else that would print there is sent to stderr:
 * console.log in the services, back-test workers, and the dotenv banner that several modules
 * print when they are loaded. That is why this file takes stdout before loading anything else,
 * and loads the server with a dynamic import.
 */
import { Writable } from "stream";

/** Keeps the real stdout for the protocol and points process.stdout at stderr. */
const takeStdout = (): Writable => {
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = process.stderr.write.bind(process.stderr) as typeof process.stdout.write;
  return new Writable({
    write(chunk, encoding, callback) {
      write(chunk, encoding, callback);
    },
  });
};

const protocolOut = takeStdout();

import("./serve")
  .then(({ serve }) => serve(protocolOut))
  .catch((err) => {
    console.error(`[mcp] failed to start: ${err?.message ?? err}`);
    process.exit(1);
  });
