# stock-app
Stock trading application


node 19.7.0
npm 9.5.0
mysql 8.0.19

https://www.npmjs.com/package/liquibase
-to get liquibase working. in the node-liquibase command set --classpath='./db/<mysql connector jar file name>'
and make sure the mysql connector jar is in the root folder.  download from
https://downloads.mysql.com/archives/c-j/

then run "npm run liquibase-scorch-and-update"

running in dev mode: npm run start:dev
to run the UI

cd to src/public/react/stock-app-frontend
npm start


## Market data

Set `MARKET_DATA_PROVIDER` in `.env` to choose where candles, quotes and market hours come from:
- `schwab` (the default): your own Schwab developer app. See "Schwab sign-in" below.
- `massive`: a Massive (formerly Polygon.io) key in `MASSIVE_API_KEY`. Live quotes and market status may need a paid Massive plan. This provider hasn't been tested against the live service yet.

## Schwab sign-in

The app signs in to Schwab itself; there is no separate token server.

Settings in `.env`:
- `SCHWAB_APP_KEY` and `SCHWAB_SECRET`: from your app on developer.schwab.com.
- `SCHWAB_REDIRECT_URI`: the callback URL registered for that app, for example `https://127.0.0.1`.

Sign in once a week, because Schwab ends every sign-in after 7 days:

    npm run schwab-login

1. A browser opens on Schwab's login page.
2. After you log in, Schwab sends the browser to your callback URL. That page won't load, which is expected.
3. Copy the page's full address and paste it at the prompt within about 30 seconds.

The refresh token is stored in the `properties` table, and a running app picks up the new sign-in without a restart. The app logs a warning when fewer than 2 days are left.

## Back tests

Back tests, analyses and variable checks run on worker threads, so a long one doesn't hold up the rest of the app. Settings in `.env`, all optional:
- `BACKTEST_WORKERS`: how many run at once. The default is one less than your CPU cores, at most 4. `0` runs them on the main thread.
- `BACKTEST_MAX_PER_USER`: how many one user may have running or waiting; past that, the request gets a 429. The default `0` means no limit.
- `BACKTEST_TIMEOUT_MS`: a back test running longer is stopped. The default is 10 minutes; `0` means no limit. At most 2147483647 (about 24.8 days), Node's longest timer.
- `BACKTEST_MAX_WAITING`: how many back tests, from all users, may wait for a free worker; past that, the request gets a 503. The default is 20; `0` means no limit.
- `BACKTEST_MAX_WAIT_MS`: a back test still waiting for a worker after this long is dropped with a 503. The default is 5 minutes; `0` means no limit.
- `DEPLOYMENT`: `self-hosted` (the default) or `hosted`. It only changes the defaults above; the hosted profile allows 2 back tests per user, stops them after 5 minutes, and lets 50 wait for at most 1 minute.

You can also sign in from the app's Settings page, which shows the sign-in's expiry, the data provider, which alert channels are set up, and the back-test settings (all read only; they come from `.env`). Or through the API:
- `GET /api/schwab/authorize-url`
- `POST /api/schwab/sign-in` with `{ "url": "<the pasted address>" }`
- `GET /api/schwab/status` shows the expiry.

Other tools on the same machine can get the current access token from `GET http://localhost:3001/schwab-token`. It returns `{ token, accessToken, refreshTime }` and only answers requests from the machine itself.

## MCP server

Claude (Claude Code, Claude Desktop or any MCP client) can read your groups, strategies, runs, back-test results and transactions through an MCP server. It calls the same services as the REST API, with the same ownership checks.

- **Transport: stdio.** The client starts the server as a child process on the same machine. Nothing listens on a port, so there's no login to configure.
- **User: one per install.** It acts for `MCP_USER_ID` or `MCP_USERNAME` from `.env`. With neither set, it uses the install's only user, and refuses to start if there are several.
- It reads the same `.env` as the app (database, market data, back-test settings) and needs the database running. The web server doesn't need to be running.

Add it to Claude Code (from the app's folder):

    claude mcp add stock-app -- npm run --silent --prefix "$PWD" mcp

`--silent` matters: stdout carries the protocol, and npm otherwise prints a banner there. After `npm run build`, `node build/mcp/main.js` (run from the app's folder) starts it without ts-node.

Tools:
- `list_groups`, `list_strategies`, `list_runs`, `list_back_test_results`, `list_transactions`: read only.
- `start_back_test` returns a job id at once; `get_back_test` gives its status and, when done, each strategy's trades, win rate, return and drawdown; `list_back_test_jobs` lists them. They run on this process's own back-test workers (the `BACKTEST_*` settings apply), and the results are saved like back tests run in the app. Jobs are kept in memory: an hour after they finish, and not across restarts.
- `describe_variables`, also the resource `stock-app://variables`: every indicator variable a filter can use, its params, and the filter format.

Live runs are controlled by the web server, so `list_runs` shows each run's status from the database.




mysql connector jar needs to be in the db folder
download link:
https://repo1.maven.org/maven2/mysql/mysql-connector-java/8.0.19/mysql-connector-java-8.0.19.jar

PM2

npm install -g pm2

pm2 start util/pm2.json --only stock-app
pm2 start npm --name "frontend" -- start --prefix ./src/public/react/stock-app-frontend
