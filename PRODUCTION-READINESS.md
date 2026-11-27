# Production Readiness: gaps not covered in REFACTOR.md

## Context
This file lists what has to change before the app is safe and reliable to publish. It follows the product decisions in [REFACTOR.md](REFACTOR.md) §6:
- **No trading for users.** Strategies emit signals, and users get email alerts. Real-money trading, the position risk monitor and the Schwab broker move to the private repo.
- **Self-hosted first.** Developers run their own copy with their own data access, so each copy has one user. A cloud copy is still on the public internet.
- **A hosted daily-data version later**, from the same codebase. Sections that only matter for it are marked **later** below.
- **The two versions differ only by configuration.** `DEPLOYMENT=self-hosted|hosted` picks the defaults for named settings (sign-up, per-user limits, email provider, candle cache), data credentials always belong to the install, and each data provider declares what its license allows. See REFACTOR.md §6, "Two deployment profiles".

The overall order lives in REFACTOR.md §6. Most of this file is its step 6.

| Section | Self-hosted, now | Hosted daily version, later |
|---|---|---|
| 1.1 SQL injection | **now** | needed |
| 1.2 Ownership | **now**, user id columns only, so hosting needs no schema change | ownership checks on every query and route |
| 1.3 Alert recipients | **now**, each user's own email settings | per-user addresses, unsubscribe, bounces, verification |
| 1.4 Market data licensing | the reasoning behind going self-hosted | the reasoning behind daily-only data |
| 2.1 Back tests in a worker | **now** | needed |
| 2.2 Candle cache | useful, for faster back tests | needed, to stay within request limits |
| 2.3 Connection pool | **now** | needed |
| 2.4 Alert outbox | **now** | needed, plus throttling and digests |
| 2.5 Scheduler errors | **now** | needed |
| 2.6 Overlapping ticks | **now** | needed |
| 2.7 Reloading runs at startup | **now** | needed |
| 2.8 Structured logging | **later** | needed |

REFACTOR.md already covers the engine side, so this file leaves these out:
- Per-job symbol scoping (Phase 1 item 10).
- Replacing quote polling with a minute-bar stream (§4 Scaling).
- Removing the per-strategy copy of vars, `assignProperties` (§3).
- Email throttling, dedup and digests (§4).
- The repo split and the `MarketDataProvider` / `Broker` interfaces (§4, Phases 3 and 4).
- Rebuilding indicator state on restart through warmup (§4).

Everything below is outside the engine: the HTTP layer, the database layer, alert delivery, the scheduler and hosting. I found these by reading the code. **I didn't run anything.**

---

## 1. Security, isolation and data rights

### 1.1 SQL injection
Every repository builds SQL by joining strings. [user-repository.ts:25](src/shared/services/repos/user-repository.ts#L25) puts the raw username from the login form straight into the query. The connection is created with `multipleStatements: true` ([db-api.ts:83](src/shared/services/db-api.ts#L83)), so a username like `x'; drop table user; --` runs as extra statements.

**Fix:** use mysql2 placeholders (`connection.execute(sql, params)` or `query(sql, params)`) in every repository, then turn off `multipleStatements`. The only code that relies on it is the `...; SELECT LAST_INSERT_ID()` pattern in [run-repository.ts](src/shared/services/repos/run-repository.ts). Replace that with the `insertId` the driver already returns.

**Status:** `multipleStatements` is off, and the `LAST_INSERT_ID()` pattern is gone. Groups, strategies, users, runs, back-test results, position rules, transactions and analysis use placeholders. Trades and util still build SQL from strings (for example `stock-info-repository.ts` pastes symbols into `in ('…')`), but a stacked `; drop table …` can no longer run.

Passwords are already hashed with bcrypt, which is good.

### 1.2 No ownership on runs, transactions, back-test results or analyses
`stock_group` and `strategy` have a `user_id` column. These don't:
- `live_job` ([create-initial-tables.sql:64](db/create-initial-tables.sql#L64)).
- `transaction_sim` and `transaction_real`.
- `backtest_result` ([backtest-results.sql](db/backtest-results.sql)).

Routes that act on them never check the caller:
- Pause, resume and end take an `id` from the request body and act on any run ([run-router.ts:224](src/routers/run-router.ts#L224)). Any logged-in user can stop anyone's strategy.
- `getCurrentRunningSimulations` and `getRuns` return every user's runs.
- `runTests` doesn't check that the strategy ids and group id belong to the caller.
- [transaction-router.ts](src/routers/transaction-router.ts) and [analysis-router.ts](src/routers/analysis-router.ts) have no user checks at all.

**Fix:** add `user_id` to `live_job` and `backtest_result` through a Liquibase changeset. Transactions can be scoped through their run. Every query that reads or changes these rows takes the user id from the JWT and filters on it. A missing row and a row owned by someone else should both return 404.

**Status:** runs and back-test results are done without a schema change. `live_job.strategy_id` and `backtest_result.strategy_id` are non-cascading foreign keys, so every row has a strategy and its `strategy.user_id` is the owner. Queries join through it. Transactions are done the same way, and analyses check that the group belongs to the caller.

The live runner also needs this check. `LiveJobRunner.pauseStrategy`, `resumeStrategy` and `endStrategy` act on the in-memory job by id alone. Check ownership in the route before calling them.

### 1.3 Every alert goes to one address
[entry-notification-service.ts](src/shared/services/entry-notification-service.ts#L33) reads the recipient from the `NOTIFY_EMAIL_TO` and `NOTIFY_SMS_TO` env vars. Every user's signals would go to you.

**Fix:**
- Store each user's email address, and phone number if SMS stays, along with their notification settings.
- Pass the recipient in from the strategy's owner.
- Add an unsubscribe link and handle bounces and complaints from Mailgun's webhooks. Without those, Mailgun will throttle or suspend the sending domain once volume grows.
- Verify email addresses at signup, so alerts aren't sent to addresses nobody owns.

### 1.4 Market data licensing
**Outcome:** this research decided the product shape. The app is self-hosted first, with each developer using their own data access. A hosted version waits for a commercial end-of-day data license and offers daily strategies only. The findings are kept here as the record of why.

What I found, from searches in November 2026. Most sources are third-party blogs, so confirm with each vendor in writing:
- **Massive (Polygon) individual plans are personal use only.** Their knowledge base says showing the data to any other person, including testers and during development, needs a Business plan. No individual plan plus expansion adds up to a Business license. Business for stocks is reported at about $2,000 to $2,500 a month.
- **Schwab's Individual developer tier covers your own account only.** Offering an app to other Schwab clients needs a separate commercial review. Market data redistribution reportedly needs exchange agreements on top of that.
- **Why Business costs so much more when API calls are unlimited on both:** you aren't paying for calls, you're paying for the license. Exchanges charge vendors per end user, with low fees for non-professional individuals and much higher fees for professionals. Showing data to other people adds display and redistribution fees, per-user reporting and exchange audits. An individual plan prices in one non-professional user. A business plan prices in the redistribution rights and the exchange fees the vendor passes through.
- **Alert emails probably count.** The current entry email includes the symbol and the fill price, which is real-time data shown to someone else. Whether a signal without a price counts as derived data under exchange rules is a question for the vendor, not something to assume.

Options, cheapest first:
1. **Users bring their own data.** Each user connects their own brokerage or data account, and their strategies run on their own entitlement. Schwab needs commercial app approval for this. Alpaca also lets users connect their own accounts, but its redistribution terms are unclear. Whether a user's own Massive individual key can be used on your server is a gray area to ask Massive about.
2. **Restrict the product to end-of-day or delayed data.** Licensing for these is much looser and cheaper. Day-period strategies still work, but intraday strategies lose most of their value.
3. **A cheaper vendor with an explicit display or redistribution license.** Tiingo reportedly sells a redistribution tier around $249 a month, and Marketstack resells Tiingo data with a commercial label from about $10 a month. These intraday feeds often come from IEX only, which is a few percent of US volume. Prices will be close to consolidated, but volume, VWAP, volume SMA and MTSI will be noticeably different from what users see on their charts.
4. **Pay for Massive Business once there's revenue to cover it.**

**Action:** decide which option you're building for before Phase 3, because it decides the `MarketDataProvider` design. Option 1 means per-user credentials and per-user data fetches, which changes the shared-fetch design in REFACTOR.md §4.

---

## 2. Reliability and performance

### 2.1 Back tests freeze the server
`BackTestService.iterateThroughCandlesAndRun` ([back-test-service.ts](src/run/back-test-service.ts)) is a synchronous loop that runs on the request thread. While it runs, Node can't answer other requests or fire the live minute tick. One user's year-long back test delays every user's alerts.

**Fix:** run back tests in a `worker_thread` pool, or in a separate worker process fed by a job queue. The HTTP route enqueues the job and returns an id, and the client polls for the result or gets notified. Limit concurrent back tests per user.

**Status:** done, keeping the request/response API (a job API can come with the step 9 UI work or the MCP server's background back tests). `BackTestPool` runs back tests, analyses and variable checks on worker threads (`BACKTEST_WORKERS`, default cores − 1, at most 4), with a per-user limit (`BACKTEST_MAX_PER_USER`, 429 past it; off when self-hosted, 2 when hosted) and a timeout (`BACKTEST_TIMEOUT_MS`). Load test at 10 medium users: the probe answered all 246 requests with a p95 of 4 ms (765 ms before step 6), and 134 back tests completed (99 before). See LOAD-TEST.md. Still on the main thread: the warm-up when a live run starts (`HistoricalWarmupService`).

### 2.2 Candle fetches have no cache or concurrency limit
`getHistoryPolygon` ([back-test-helper.ts:386](src/back-testing/back-test-helper.ts#L386)) starts one request per symbol, all at once, with `Promise.all`. Every back test fetches its candles again, even when another user just fetched the same symbols and dates.

**Fix:**
- Store candles keyed by symbol, period and date, in MySQL or on disk.
- Fetch only the missing ranges.
- Put a concurrency limit on outbound requests, so a large group doesn't hit Polygon's rate limit or hold every response in memory at once.

### 2.3 One database connection for everything
`DatabaseAPI` holds a single `mysql.Connection` ([db-api.ts:12](src/shared/services/db-api.ts#L12)), so every query from every request runs one after another.

It's also a correctness bug. `runTwoStatements` ([db-api.ts:185](src/shared/services/db-api.ts#L185)) opens a transaction on that shared connection. Queries from other requests that arrive in the meantime run inside the transaction, and a rollback undoes them too.

**Fix:** switch to `mysql.createPool`. Use `pool.query` for single statements. For a transaction, take a dedicated connection with `pool.getConnection()` and release it at the end.

**Status:** done. `DatabaseAPI` uses a pool (`DB_POOL_SIZE`, default 10). `runTwoStatements` was already gone, so no app code shares a transaction; the only transactions are the integration tests' rollback sandbox, which pins one connection while open. Load test: typical reads no longer queue (median for listing strategies and groups 68–84 ms → 4–8 ms at 10 medium users, confirmed by reruns with a similar back-test load); the tails are still the back tests (§2.1). See LOAD-TEST.md.

### 2.4 Alerts are sent inline
`notifyEntry` ([strategy-simulation.ts:98](src/real-time-trading/strategy-simulation.ts#L98)) sends each alert from inside the strategy's entry step, one Mailgun call per signal. The call has no timeout and no retry. A slow or failing Mailgun call means late or lost alerts, and failures are only written to a local log file.

**Fix:** write each signal to an `alert_outbox` table, with the user, payload, status and attempt count. A separate loop sends pending rows with a timeout and retries with backoff. That loop is also where REFACTOR.md's throttling, dedup and digests belong. A record of what was sent also lets you show users their alert history.

**Status:** done. Entry alerts, scheduler failures and Schwab sign-in warnings go into `alert_outbox`, one row per channel, with the user taken from the run's strategy. `AlertOutbox` sends them with a 15 s timeout and retries with backoff (30 s doubling to 30 minutes, 8 attempts), and rows survive a restart. Dedup is by an optional key per channel. Entry and exit alerts are throttled per user and channel and sent as digests (`ALERT_DIGEST_MS`; REFACTOR.md step 7). The history isn't shown anywhere yet. See REFACTOR.md step 6, "Alert outbox".

### 2.5 One error stops everyone for the day
In [strategy-scheduler.ts:135](src/run/strategy-scheduler.ts#L135), any error thrown from `job.run()` clears the minute interval. A network blip or an expired market-data token then stops every user's strategies until the next daily check. A comment above `isMarketOpen` notes that a 401 can crash the whole app.

**Fix:**
- Log the error and keep the interval running.
- Retry the data fetch on the next tick.
- Catch errors around each strategy's evaluation, so one strategy's failure doesn't skip the rest.
- Alert yourself when ticks fail several times in a row.

**Status:** done. The scheduler logs a failed tick and keeps going, and retries a failed or "closed" market-open check the next minute. It logs an error after 5 failed ticks in a row (emailing it waits for §2.4). A due period with no quotes counts as a failure, and Schwab quotes throw when every batch fails. Each strategy's run is wrapped, so one failure doesn't skip the rest. Market-data reads time out after 30 s. See REFACTOR.md step 6, "Scheduler".

### 2.6 Minute ticks can overlap
The minute `setInterval` doesn't check whether the previous `job.run()` finished. As users add symbols, fetching quotes in batches of 195 with a pause between batches takes longer. Once a run takes more than a minute, two runs change the same shared memories and vars at once.

**Fix:** keep an in-progress flag. If a run is still going when the next tick fires, skip that tick and log it. Better, schedule the next run when the current one finishes, aligned to the next minute boundary. Track tick duration so you can see when you're getting close.

**Status:** done. Ticks are aligned to the minute (1 s after the boundary) and never overlap. A minute that starts while a tick is running waits and runs right after it, keeping only the latest waiting minute, so a slow 15:58 doesn't lose the DAY bar. Slow ticks, minutes that didn't run, and a tick that seems stuck are logged. A real-money run still going from the previous minute skips the next one.

### 2.7 A restart leaves ghost runs
Running strategies exist only in `LiveJobRunner`'s memory. After a restart or deploy, `live_job` rows still say `active`, but the runner starts empty and nothing reloads them. `LiveJobRunner.clean()` would end them, but nothing calls it. So after every deploy, all users' strategies silently stop while the UI shows them as running.

REFACTOR.md covers rebuilding indicator state through warmup. This is the step before that.

**Fix:** at startup, load every `active` and `paused` run from the database, rebuild its strategy, warm it up and schedule it. Paper positions for exit signals, from REFACTOR.md §4, need to be stored in the database for this to work, or exits are lost on restart.

**Status:** done for simulations, except open positions. Simulations reload at startup; real-money runs and runs nobody owns are ended (a real run can't safely resume, see REFACTOR.md step 6); runs that fail to load show `loaded: false`. A simulation's open positions are still lost on restart until paper positions are stored (REFACTOR.md Phase 4).

### 2.8 Logs are local files
`TradeLogger` ([trade-logger.ts](src/shared/utilities/trade-logger.ts)) appends to a file per run in `outputFolder` on local disk. It calls `writeFile` twice per line, once to create the file and once to append. Files grow without limit and are lost on container hosting, where the filesystem resets on deploy.

**Fix:** log structured JSON to stdout and let the host collect it. Anything users should see, such as a strategy's signal history, belongs in the database.

---

## 3. Suggested order
> **The overall order now lives in [REFACTOR.md](REFACTOR.md) §6**, which places these fixes in step 6, after the engine rewrite. The list below is the order within that step.

1. Parameterize all SQL and turn off `multipleStatements` (§1.1).
2. Add `user_id` and ownership checks to runs, transactions, back-test results and analyses (§1.2).
3. Check the market data terms (§1.4), since the answer affects Phase 3.
4. Per-user alert recipients and the alert outbox (§1.3, §2.4).
5. Connection pool (§2.3).
6. Scheduler resilience and the overlap guard (§2.5, §2.6).
7. Back tests off the main thread and the candle cache (§2.1, §2.2).
8. Reload active runs at startup (§2.7), together with REFACTOR.md's warmup work.
9. Structured logging (§2.8).
