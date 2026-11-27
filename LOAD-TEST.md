# Load test

Measures how the server holds up when several users work at once, so the step 6 fixes ([REFACTOR.md](REFACTOR.md) §6, [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md) §2) can be compared before and after.

## What it does

Each simulated user:
1. Registers, logs in, creates a stock group and a strategy, and checks that the group id it got back belongs to its own group.
2. Loops over a mix of actions, with 0.5–1.5 s of think time between them:
   - **mixed**: back test 1 part, list strategies 2, list groups 1, create and delete a strategy 1;
   - **backtest**: back tests only.

A separate **probe** user asks for its strategy names (a small database read) every 250 ms. A slow probe means the server isn't answering anyone. That's how a back test blocking Node's event loop shows up (PRODUCTION-READINESS §2.1).

Each run steps through 1, 2, 5 and 10 users, for 60 s at each level, and records the following for every endpoint:
- request count and rate
- p50, p95, p99 and max latency
- errors

Two back-test sizes (`util/load-test/common.ts`):

| profile | bars | symbols | range |
|---|---|---|---|
| small | daily | 7 | Nov 2025 – Nov 2026 (1 year) |
| medium | 30-minute | 25 | Aug – Nov 2026 (3 months) |

## Isolation

- **Database:** its own schema, `stock_app_loadtest`, with the same tables as the app's schema and no rows. The test server refuses to run against a schema whose name doesn't end in `_loadtest`.
- **Market data:** recorded candles, served by the `recorded` provider. The test measures the server, not Schwab, and makes no Schwab calls while it runs. The recordings are Schwab market data: they're gitignored and must not be committed or shared.
- **Server:** `npm run load-test:server` is the app's own Express server on port 3101. It skips the Schwab sign-in check and the position monitor, which aren't part of serving requests.

## Running it

One-time setup:
1. As a MySQL admin, create the schema and let the app's user use it:
   ```sql
   CREATE DATABASE stock_app_loadtest;
   GRANT ALL PRIVILEGES ON stock_app_loadtest.* TO 'testuser'@'localhost';
   ```
2. Copy the table structure: `npm run load-test:schema`. Run it again after schema changes; it empties the load-test schema.
3. Record candles while signed in to Schwab: `npm run load-test:record`.

Each run:
```
npm run load-test:server            # in one terminal
npm run load-test -- --profile small --mix mixed --label after-pool
```
Options:
- `--profile small|medium`
- `--mix mixed|backtest`
- `--levels 1,2,5,10`
- `--duration 60` (seconds per level)
- `--think 1000` (ms)
- `--label <name>`
- `--base <url>`

Results are saved to `util/load-test/results/<label>-<profile>-<mix>-<time>.json` and `.md`.

To compare runs, run them the same way. The baseline ran all four profile and mix combinations one after another, against one server process.

## Baseline (before step 6), 22 November 2026

Commit `99ef52c` plus the load-test tools. The machine was an Intel Core i9-9980HK (8 cores, 16 threads) with 32 GB of RAM, running Node 20.19 and local MySQL 8. The load generator, the server and MySQL all ran on the same machine. Raw results are in [util/load-test/results/](util/load-test/results/).

A back test on its own takes about **70 ms** (small) or **390 ms** (medium). Without back tests running, the probe and every other request answer in **4–6 ms**.

### Back tests: latency and throughput

| run | users | back tests per s | p50 | p95 | max |
|---|---|---|---|---|---|
| small, back tests only | 1 | 1.0 | 65 ms | 69 ms | 92 ms |
| | 10 | 8.9 | 83 ms | 259 ms | 414 ms |
| medium, back tests only | 1 | 0.75 | 390 ms | 418 ms | 504 ms |
| | 2 | 1.34 | 391 ms | 673 ms | 752 ms |
| | 5 | 2.34 | 1.06 s | 1.99 s | 2.88 s |
| | 10 | **2.52** | **2.89 s** | 3.44 s | 3.72 s |
| medium, mixed | 10 | 1.59 | 811 ms | 2.09 s | 2.48 s |

### The probe: how long everyone else waits

The probe asks every 250 ms, so a healthy level gives about 240 answers.

| run | users | probe answers in the ~60 s | p50 | p95 | max |
|---|---|---|---|---|---|
| small, mixed | 10 | 246 | 4 ms | 31 ms | 64 ms |
| small, back tests only | 10 | 244 | 12 ms | 96 ms | 196 ms |
| medium, mixed | 1 | 240 | 4 ms | 6 ms | 387 ms |
| | 10 | 192 | 5 ms | 765 ms | 1.57 s |
| medium, back tests only | 1 | 240 | 4 ms | 314 ms | 371 ms |
| | 5 | 117 | 387 ms | 1.10 s | 1.52 s |
| | 10 | **71** | 18 ms | **2.15 s** | 2.49 s |

### What the baseline shows

1. **Back tests stop the server from answering anyone else** (PRODUCTION-READINESS §2.1). Even one user running medium back tests holds the probe for up to 370 ms. At 10 users, a 4 ms read waits up to 2.5 s, and the probe got 71 answers in that level instead of about 240. Simple requests in the mixed runs show the same tail: at 10 users, listing strategies has a p99 of 1.6 s. The live minute tick runs on the same thread, so it would be delayed the same way.
2. **The server tops out at one CPU core.** Medium back tests level off at about 2.5 per second. That's 2.5 × 390 ms, which is roughly one core's worth of work, and it stays that way from 5 users up while the other cores sit idle. Past that point, extra users only wait longer: the p50 grows from 390 ms to 2.9 s.
3. **Database time isn't the bottleneck yet.** Strategy and group requests take 4–6 ms when nothing else is running, and their slow tail matches the back tests running at the same time. That means the connection pool (§2.3) is needed for correctness: transactions on the shared connection. It shouldn't change these numbers much on its own. Moving back tests to workers (§2.1) is the change these numbers should show.
4. **No errors.** There were no failed requests, and every group id that came back belonged to the user who created it. Sign-up ran 11 users at once, and the transaction bug on the shared connection (§2.3) didn't show up here. That doesn't mean it can't happen: it needs one request's queries to land between another request's statements.

### Not measured

- **Memory:** the server's memory use wasn't recorded.
- **The live minute tick:** the test server doesn't run live strategies, so the tick's delay is inferred from the probe.
- **Larger back tests:** for example 100+ symbols or 1-minute bars. Each one would hold the server proportionally longer.
- **Schwab fetch time:** live fetches would add to each back test. Recording this test's candles took 1.5 s (small) and 0.7 s (medium) from Schwab.

## After the connection pool (step 6), 23 November 2026

The same machine and settings, run once each for small and medium with the mixed mix (`--label after-pool`). Raw results are in [util/load-test/results/](util/load-test/results/) (`after-pool-*`). Each figure is from a single run, so differences of a few tens of ms are noise.

**Small, mixed:** unchanged. At 10 users the probe got 246 answers (p95 25 ms, max 63 ms), against 246 (p95 31 ms, max 64 ms) in the baseline.

**Medium, mixed, 10 users:**

| | baseline | after the pool |
|---|---|---|
| list strategies, p50 / p95 | 68 ms / 735 ms | 8 ms / 566 ms |
| list groups, p50 / p95 | 84 ms / 801 ms | 4 ms / 521 ms |
| back test, p50 / p95 | 811 ms / 2.09 s | 440 ms / 1.13 s |
| back tests completed | 99 (1.59 per s) | 82 (1.33 per s) |
| probe answers (of about 240) | 192 | 212 |

What this shows:
- **Typical reads no longer queue.** The median for listing strategies and groups dropped from 68–84 ms to 4–8 ms, because a read no longer waits behind other requests' queries on the one connection. (Creating a strategy, a write, dropped from 114 ms to 6 ms.) The rechecks below ran a similar number of back tests on both versions and show the same drop, so it isn't explained by the lighter back-test load in this run.
- **The tails are still the back tests.** Reads still reach 0.5–1 s at p95/p99, and the probe misses about 30 answers, because back tests hold the only thread. Moving them to workers (§2.1) is still the change that matters.
- **Not a clean comparison for the back tests themselves.** 17% fewer back tests ran in this run than in the baseline, which on its own lowers CPU contention. So the back-test latency improvement shouldn't be credited to the pool.

### Recheck: deleting a strategy at 10 users

In the run above, deleting a strategy looked slower after the pool: p95 went from 17 ms to 337 ms and p99 from 399 ms to 746 ms. To check, the 10-user level of medium mixed ran twice on each version (`--levels 10`; raw results `old-a`, `old-b`, `pool-a`, `pool-b` in [util/load-test/results/](util/load-test/results/)). MySQL's row-lock counters (`Innodb_row_lock_waits`, `Innodb_row_lock_time`) were read before and after each run.

| | old (one connection) | pool |
|---|---|---|
| delete strategy, p50 / p95 | 5 / 351 ms, 5 / 718 ms | 4 / 371 ms, 5 / 704 ms |
| list strategies, p50 | 62 ms, 94 ms | 4 ms, 5 ms |
| back tests completed | 83, 96 | 83, 90 |
| row-lock waits | 0, 0 | 0, 0 |

- **Deletes didn't get slower.** Both versions give the same tail. The baseline's 17 ms p95 was a lucky run.
- **The slow deletes aren't the database.** No query waited on a row lock in any run. A delete is one `delete … where id in (?) and user_id = ?` that takes about 4 ms. Its tail matches every other endpoint's: requests that arrive while a back test holds the thread wait for it (§2.1).

## After back-test workers (step 6), 23 November 2026

Back tests now run on 4 worker threads (`BACKTEST_WORKERS` default on this 16-core machine). Same machine and settings, one run each for small and medium with the mixed mix (`--label after-workers`). Raw results are in [util/load-test/results/](util/load-test/results/) (`after-workers-*`).

**Small, mixed:** every endpoint other than back tests stays at 4–7 ms p95 at every level, and the probe's worst answer at 10 users dropped from 63 ms to 7 ms.

**Medium, mixed, 10 users:**

| | baseline | after the pool | after workers |
|---|---|---|---|
| probe answers (of about 246) | 192 | 212 | 246 |
| probe p95 / max | 765 ms / 1.57 s | 581 ms / 1.11 s | 4 ms / 18 ms |
| list strategies, p50 / p95 | 68 / 735 ms | 8 / 566 ms | 3 / 4 ms |
| list groups, p50 / p95 | 84 / 801 ms | 4 / 521 ms | 3 / 4 ms |
| create strategy, p95 | 744 ms | 421 ms | 5 ms |
| back tests completed | 99 (1.59 per s) | 82 (1.33 per s) | 134 (2.2 per s) |
| back test, p50 / p95 | 811 ms / 2.09 s | 440 ms / 1.13 s | 351 / 433 ms |

What this shows:
- **Back tests no longer hold up anyone else.** Every other request answers in a few milliseconds at every level, and the probe never missed an answer.
- **More back tests get done, each about as fast as when run alone.** One medium back test takes about 350–400 ms by itself; at 10 users the p95 is 433 ms, so they barely wait for a worker. Throughput rose from about 1.6 to 2.2 per second. The load test's users pause between requests, so this isn't the pool's ceiling.
- **No errors** at any level.

