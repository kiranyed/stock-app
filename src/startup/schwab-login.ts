/**
 * npm run schwab-login
 *
 * Opens Schwab's login page. After you log in, Schwab redirects the browser
 * to the app's callback (http://127.0.0.1…), which shows an error page: copy
 * that page's full address and paste it here within about 30 seconds.
 * The refresh token is stored in the database; a running app picks it up.
 */
import readline from "readline/promises";
import { execFile } from "child_process";
import * as dotenv from "dotenv";
import { DatabaseAPI } from "../shared/services/db-api";
import { SchwabAuth } from "../providers/schwab/schwab-auth";

dotenv.config();

const main = async () => {
  await DatabaseAPI.createConnection();
  const before = await SchwabAuth.status();
  if (before.signedIn && before.refreshExpiresAt) {
    console.log(`Currently signed in until ${new Date(before.refreshExpiresAt).toLocaleString()}.`);
  }

  const url = SchwabAuth.authorizeUrl();
  console.log(`\nOpen this page and log in to Schwab:\n\n  ${url}\n`);
  if (process.platform === "darwin") execFile("open", [url]);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const pasted = await rl.question(
    "Paste the address of the page Schwab sends you to (it starts with your callback URL):\n> ",
  );
  rl.close();

  const status = await SchwabAuth.completeSignIn(pasted);
  console.log(
    `\nSigned in. Schwab requires signing in again by ${new Date(status.refreshExpiresAt!).toLocaleString()}.`,
  );
};

main()
  .catch((err) => {
    const detail = err?.response?.data ? ` ${JSON.stringify(err.response.data)}` : "";
    console.error(`\nSign-in failed: ${err?.message ?? err}${detail}`);
    process.exitCode = 1;
  })
  .finally(() => DatabaseAPI.closeConnection().catch(() => undefined));
