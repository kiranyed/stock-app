# Architecture & Indicator Review — stock-app

> **Read this before acting on anything below.** This document was written before most of the work it describes, and it is updated as steps land. Many of its findings and suggestions (in §1–§5 especially) have already been implemented, partly implemented, or replaced by a different design during the refactor. Before implementing any item, check the current code and `git log` to see whether the functionality is already there. If it is, don't build it again: mark it done here instead. §6 ("Revised order") is the current plan, and its **Progress** and **Open** lists are the most up-to-date record of what's done and what isn't.

## Context
You asked for a review of the business architecture (filterVars and memories as shared 3-D maps, master jobs, warmup, backtest/live), whether the indicator formulas (MTSI, RSI, MACD, RSI/MACD divergence) are correct and useful, whether data collection in memories-helper and filter-vars-helper is right, and how to prepare for multi-user use (a TradingAPI interface, a separate private repo for personal trading, email signals in place of real orders).

I got these findings by reading the code and tracing it by hand. **I didn't run anything**, so step 1 of the plan is to confirm each finding with a test before fixing it.

---

## Verdict in one paragraph
**The core idea is right.** Computing each unique (period, symbol, indicator) once and sharing it across strategies is how real screeners scale. One engine for both backtest and live is also a big plus. The problems are in how it's built. One indicator's logic is spread across **5 places that must stay in sync**:
- variable-patterns
- filter-variable-resolver
- calculateMemoryRequirements
- adjustMemory
- the 5 hand-ordered passes in transferVars

Several of these have drifted apart, and as a result **RSI divergence, RSI crossover, the MACD signal line, MACD crossover, MACD divergence and probably Bollinger Bands give wrong or constant results in real runs**. Your unit tests mock the matchers, parsers and VariableUtil and fill memories by hand, so they can't see any of this. Separately, a few live-only paths (volume, VWAP, day-period timing) differ from the backtest, so backtest results won't match live signals.

---

## 1. Indicator formulas

| Indicator | Math | Status in a real run |
|---|---|---|
| percentChange, SMA, EMA (SMA seed) | Correct | OK |
| RSI | Simple average of the last N changes (Cutler's RSI). Brokers and TradingView use Wilder's smoothing | Works, but **won't match users' charts**. Switch to Wilder's |
| MACD line | fastEMA − slowEMA, correct | OK as a var |
| MACD signal | EMA of MACD, seeded from `memories[macd]` | **Always NaN**. `adjustMemory` builds the MACD history from `memories["priceEma12"]`, which is never allocated ([memories-helper.ts:192](src/run/memories-helper.ts#L192)), so the history is all NaN, the seed is NaN, and the EMA never starts |
| MACD crossover | Before-window below, after-window above, a reasonable definition | **Never computed**. The builder writes `…Crossover${level}PeriodsBefore…` ([variable-patterns.ts:104](src/shared/utilities/variable-patterns.ts#L104)) but the regex expects `…CrossoverPeriodsBefore…` (line 26). Also, before/after were passed in swapped order (**fixed in Phase 1 item 4**) |
| MACD divergence | Uses `lookback` | **Always 0**, because the MACD history is NaN |
| RSI crossover | Before below the level, after above it | **Day 1: always 0. Day 2 onward, intraday: always 1 (both bullish and bearish)**. Nothing writes `memories["rsi14"]`. After `clearIntradayStateData` sets `list: []`, the check runs on an empty array, and `[].every()` is `true` |
| RSI divergence | Last two price swing lows (1-bar pivots on closes), RSI higher low | **Always 0**, because the RSI history is never written. The design has problems too: `before`/`after` don't drive pivot detection, the RSI version uses `before+after` while the MACD version uses `lookback`, the signal stays on for many bars instead of firing once, and there's no requirement that the last pivot be recent |
| MTSI | EMA(EMA(ln(p/VWAP))) / EMA(EMA(\|ln(p/VWAP)\|)) × 100 | **The idea holds up**: a ±100 oscillator for "how persistently price sits above or below VWAP". It isn't the standard TSI, so label it clearly for users. Problems: (a) treating exactly ±100 as NaN throws away real readings in strong trends; (b) the memory path and the var path compute EMA1 separately, with different VWAP formulas (close×vol vs typical price) and different seeding (**the memory path was deleted in Phase 1 item 3**; the one-bar VWAP lag, golden #5, is what remains); (c) live VWAP is broken (§2.5) |
| Bollinger Bands | Population standard deviation, correct | **Probably never computed**. The UI sends `bollingerbands` and the backend builds `bollingerBands{p}Multiplier{m}`, which matches no pattern. The memory reservation uses `extractTimeAgo("…Upper")`, which returns 0 |
| Price %-change percentile | A good idea that normalizes move size per stock | **Broken for intraday**. The histogram uses fixed 2% bins over ±20%, so 1-minute moves land in about 2 bins. Histograms are also rebuilt *after* the daily clear, so they're always empty (§2.3) |

**Are they useful?** As building blocks, yes. None of them is an edge on its own, especially on 1-minute bars after spread and slippage. For a user-facing product, what users actually get from these indicators depends on how honest the backtester is: fills, costs, out-of-sample testing. I didn't audit cost or slippage modeling. Intraday fills at the next bar's open are good, because they avoid lookahead.

**A divergence that actually works:** detect pivots with left strength = `before` and right strength = `after`, using bar lows/highs. Compare the indicator's values at those two pivots. Require the second pivot to be confirmed within the last `after` bars, and fire **only on the confirmation bar**.

---

## 2. Data collection bugs (memories / filterVars), by severity

1. **Derived histories never get filled.** `rsiN`, `macd…Signal…` have no writer, and `macd…` reads EMA memories that don't exist. Root cause: derived history is built in `adjustMemory`, which runs **before** the vars update. The fix is to have each indicator append its own output after it's computed.
2. **MACD crossover name mismatch plus the swapped arguments** (table above).
3. **Intraday state is wiped every day** ([master-job.ts:52](src/shared/classes/master-job.ts#L52)), and warmup covers only DAY and above ([historical-warmup-service.ts:22](src/run/historical-warmup-service.ts#L22)). 30-minute bars give 13 per day and 60-minute bars give 7, so **RSI14 and MACD(12,26) on 30/60-minute bars never become valid**. Percentile "sessions" can never exceed one session. In the backtest, `clearIntradayStateData()` runs before `runDailyMaintenance()` ([back-test-service.ts:92-97](src/run/back-test-service.ts#L92-L97)), and live does the same (cleared at 16:00, maintenance at 8:00), so histograms are built from empty lists.
4. **Wall-clock gap math.** `unitsAgo = (t − lastTime)/period` in real minutes, so overnight and weekend gaps insert hundreds or thousands of NaN slots. When the gap falls between `len` and `2·len`, `fill(NaN, len−unitsAgo, …)` takes a negative start and leaves stale values at the front of the list.
5. **Live-only bugs that a backtest can't catch:**
   - Volume delta subtracts the *previous delta*, not the previous cumulative volume ([filter-vars-helper.ts:155](src/run/filter-vars-helper.ts#L155)).
   - VWAP numerator: `oldVwapDenominatorVal ?? …` with a value of `0` never falls back. The numerator key is inserted first ([strategy-run.ts:104](src/shared/classes/strategy-run.ts#L104)), so each tick adds `price × cumulativeVolume`. **Live VWAP, and so MTSI, are wrong.**
   - The VOLUME memory stores cumulative volume in live, so `volumeSma` is wrong.
6. **The live DAY period updates at the wrong time.** `LiveMasterJob.handleNewData` filters on `minutesSinceStart % period === 0` without the 3:59 special case ([live-master-job.ts:127](src/shared/classes/live-master-job.ts#L127)). DAY data gets updated at **9:30 with the open price** if intraday jobs exist, or **never** if only day jobs exist. The backtest updates at the 3:59 close.
7. **Multi-user scoping.** `LiveMasterJob` keeps the *first* group, and later `prepare()` calls use `this.group` ([master-job.ts:43](src/shared/classes/master-job.ts#L43)). So a second user's stock group never gets loaded, and every strategy screens **every fetched symbol** ([strategy-run.ts:267](src/shared/classes/strategy-run.ts#L267)), not just its own group.
8. **`timePeriods.sort()` sorts as strings** (1, 10, 1440, 30, 5, 60) and changes the caller's array ([filter-vars-helper.ts:126](src/run/filter-vars-helper.ts#L126), [memories-helper.ts:92](src/run/memories-helper.ts#L92)).
9. **Minor:**
   - `open: candles[index].volume` ([data-retriever.ts:103](src/run/data-retriever.ts#L103)).
   - `this.constructor.name === "simulation"` is never true ([strategy-run.ts:280](src/shared/classes/strategy-run.ts#L280)).
   - Warmup `calendarDays = space·7/5 + 5` ignores holidays, so SMA200 gets about 196 trading days.
   - The TSI memory requirements are dead code (no calculation exists).

### Found later by the golden tests
The golden tests in [src/tests/golden/](src/tests/golden/) found these bugs, which aren't listed above. Each has a failing test, except item 7 (see its note). Most severe first:

1. **The screener crashes on most indicator filters.** `FilterGroup.evaluateExpression` looks up the variable with `StrategyUtil.convertToVariableName`, not with `resolvePrimaryVariable`, so the name it reads doesn't match the name the engine computes. Any strategy with a `macd`, `macdCrossover`, `rsiCrossover`, `rsiDivergence` or `macdDivergence` filter throws `TypeError: Cannot read properties of undefined` at [filter-group.ts:61](src/shared/classes/filter-group.ts#L61) on its first evaluation. So in a real run, these strategies crash before the wrong or constant values in §1 ever matter. Fix: evaluate filters by `resolvePrimaryVariable(filter)`.
2. **The Bollinger lower band is always NaN.** The Lower branch sets `shouldAssign = true` and writes the band straight into `vars`, then the generic `if (shouldAssign)` assignment overwrites it with `NaN` ([filter-vars-helper.ts:227-244](src/run/filter-vars-helper.ts#L227-L244), [filter-vars-helper.ts:319-321](src/run/filter-vars-helper.ts#L319-L321)). The Upper branch doesn't set `shouldAssign`, so its value matches `technicalindicators`.
3. **Bollinger Bands on their own crash the engine.** This adds to the §1 memory-reservation finding. When nothing else reserves price memory, `memories[PRICE][symbol]` doesn't exist, and the Lower branch reads `.list` *before* its length check ([filter-vars-helper.ts:231](src/run/filter-vars-helper.ts#L231)). The result is a `TypeError`, not NaN.
4. **RSI gives values before it has enough data.** The price memory is allocated at full length and filled with NaN, so `priceListLength >= periodLength` is always true ([filter-vars-helper.ts:221](src/run/filter-vars-helper.ts#L221)). `calculateRsi` then quietly skips the NaN diffs. RSI14 reads 100, 100, 100, 61.7… from bar 2, when it should be NaN until bar 15. Once warmed up it matches Cutler's RSI exactly. The same "full-length list" check guards SMA, EMA, BB and volume SMA. Those come out NaN anyway, because NaN spreads through a sum, but the check means nothing there either. Fix: count finite values, not `list.length`.
5. **Backtest VWAP lags one bar.** `initVars` inserts the strategy's variables (including `vwap{p}`) before the cross-period `vwapNumeratorCumulative` / `vwapDenominatorCumulative` keys ([filter-vars-helper.ts:29-52](src/run/filter-vars-helper.ts#L29-L52)). The first pass in `transferVars` walks keys in insertion order, so `vwap1` is computed from the *previous* bar's cumulative values ([filter-vars-helper.ts:299-317](src/run/filter-vars-helper.ts#L299-L317)). It equals the reference VWAP for bar i−1 (max error 4e-14). This lag feeds into the MTSI var path and adds to the gap in §1 MTSI (b). It's separate from §2.8, which causes the same kind of lag across periods.
6. **Several UI dropdown values never get computed.** The frontend sends `bollingerBands`, `macdSignalLine`, `vwap` and `volumeSma` ([filter.tsx:25-45](src/public/react/stock-app-frontend/src/real-time-trading/filter-group/filter.tsx#L25-L45)). The resolver turns them into `bollingerBands20Multiplier2`, `macdSignalLine`, `vwap` and `volumeSma` ([strategy-util.ts:55-80](src/shared/utilities/strategy-util.ts#L55-L80)), and none of these match a pattern in `VariablePatterns`. The UI also has no period input for these four. Even when the test supplies a period (`timeAgo`), `vwap` and `volumeSma` drop it, because `convertToVariableName` only appends `timeAgo` for `percentchange`, `priceEma`, `priceSma` and `rsi`.
7. **Stale price after a data gap (backtest).** `BackTestHelper.getTestData` feeds `candles[index - 1]` without checking that it's the previous period's candle (the code already has a TODO for this, [back-test-helper.ts:88-98](src/back-testing/back-test-helper.ts#L88-L98)). After a gap, it feeds the last pre-gap close at the first post-gap time. This came up while building the §2.4 gap fixture. No test checks it directly.

---

## 3. Architecture review

**What's right**
- Dedup by (period, symbol, canonical variable key).
- One pipeline (`adjustMemory → processData → jobs`) for both backtest and live.
- Master job as the single point that schedules every strategy.
- Next-bar-open fills for intraday trades.

**Structural problems behind the bugs above**
1. **One indicator is split across 5 switch statements.** Adding an indicator means editing all five consistently, and bugs 1, 2 and Bollinger Bands are exactly places where that didn't happen.
2. **"Memories" mixes raw input history (price, volume) with derived output history (rsi, macd)**, and the derived history is computed in the wrong phase. That's why `getVwap` has to recompute VWAP inside the memory step.
3. **Regex in the hot loop.** On every tick, for every key and every symbol, about 10 regex tests run in each of 5 passes. `classifyVariable` caches this, but nothing in production calls it. `filter-vars-helper.ts` and `memories-helper.ts` make 62 direct `VariableParsers`/`VariableMatchers` calls instead (31 each), inside a period → symbol → key loop, so every key is re-classified for every symbol on every tick.
4. **Copying vars into each strategy (`assignProperties`) costs jobs × vars × symbols on every tick.** That copy step is where the scalability goal gets lost: shared compute, then N full copies.
5. **Live and backtest split on `isStockDataBackTest`** (cumulative volume, quote vs candle, two VWAP formulas). They should be normalized at the boundary, not inside the engine.
6. **Session model.** A daily wipe plus wall-clock gaps means intraday indicators can't use prior sessions.
7. **Process model.** A single in-process singleton driven by `setInterval`, with all state in memory. A restart loses intraday state. Live data comes from polling quotes in batches of 195 every minute.

**Target shape (incremental, no rewrite)**
- **Indicator registry:** `interface Indicator { key; deps; historyLength; resetPolicy: 'session' | 'never'; update(bar, view): number }`. Each indicator is one small file with its own golden test. At init the engine builds a dependency graph per period, sorts it once, and makes **one pass per bar**. Each indicator appends its own output to a **ring buffer** if anything needs its history. This replaces all 5 switch statements and the duplicate MTSI path. Keys stay canonical strings, so dedup still works.
- **Bars in, not quotes.** A provider layer produces `Bar {symbol, period, t, o, h, l, c, v}` for both history and live (stream minute bars and aggregate up to longer periods). The engine has no live/backtest branches.
- **Strategies read a scoped, read-only view** of the shared store (only their own symbols). The only vars a strategy owns are position-derived ones like `percentGain` and `timeSinceEntry`. This drops `assignProperties`.
- **Strategies emit `Signal` events** to sinks (email or push for users, a broker executor for you).

---

## 4. Multi-user and product split
- **Two independent apps (decided November 2026).** This section first proposed a `MarketDataProvider`/`Broker` split and a private repo that imports the public core. Instead:
  - The **public app** has signal strategies, paper positions, alerts and Schwab market data.
  - The **private app** has the Schwab account and orders, position rules and the risk monitor, the trading dashboard and the charts page.
  - Neither imports the other, at run time or as a package. Both may call Schwab: market data from the public app, the account from the private one, ideally with separate Schwab app registrations.
- **They may merge again one day.** So keep features decoupled and reusable in both apps (clear module boundaries, dependencies passed in rather than reached for) and don't repeat code, so a merge is a move rather than a rewrite.
- **`StrategySimulation` stays public; `RealMoneyStrategy` is retired.** The private app doesn't need to run the public app's strategies. Automated execution from signals can be designed again later if wanted; the old subclass isn't carried forward.
- **Scaling.** One process will hold out for a long time. Compute grows with the number of unique (symbol, indicator, period) combinations, not the number of users, once the per-strategy copy is gone. The first real limit is data: switch from quote polling to a minute-bar websocket stream, and rebuild state on restart through warmup.

---

## 5. Plan: what I'd do first (Phase 1), then the roadmap

### Phase 1: correctness harness and targeted fixes (no big refactor)
"Golden #N" below refers to item N in §2 "Found later by the golden tests".

1. **Golden end-to-end tests, no mocks. Done:** [src/tests/golden/](src/tests/golden/), run with `npx jest src/tests/golden`. Fixed bar series go through the real `BackTestMasterJob` and `BackTestService.iterateThroughCandlesAndRun`, with candles loaded into the real `BackTestHelper`. Quote snapshots go through `LiveMasterJob.handleNewData`. Values are compared against `technicalindicators` or independent references. The tests cover a multi-day run (across `clearIntradayStateData`), the live path (quotes with cumulative volume) and DAY timing in `LiveMasterJob`. At the time of writing, 38 of 55 fail. Every tested finding in §1 and §2 has a failing test, except two that turned out not to be real as written: the percentile "2% bins" (the histograms are always empty, so the exact fallback is used) and overnight gaps in §2.4 (the daily wipe hides them). Each fix below should turn its tests green without breaking the passing ones. The tests that depend on key naming stay red until Phase 1.5: the MACD crossover value, Bollinger via the filter path, and the UI dropdown names.

All key-naming fixes are in Phase 1.5, not here, because 1.5 deletes the parsers and builders those fixes would edit. Item 2 is the one exception: a one-line stopgap that unblocks everything else.
2. **Fix the screener lookup first (golden #1). Done:** the 5 screener tests now pass, and no other test changed. The compare var needed no change, because `resolveFilterVariables` already registers it with `convertToCompareVarName`. In `FilterGroup.evaluateExpression` ([filter-group.ts:54-61](src/shared/classes/filter-group.ts#L54-L61)), read the value by `resolvePrimaryVariable(filter)` instead of `convertToVariableName`. Use the matching compare-var key too. Until this lands, any strategy using `macd`, crossover or divergence filters crashes, so the fixes for those indicators can't be seen in a real run. Phase 1.5 removes the second key producer for good.
3. **Fix the derived histories. Done:** 6 golden tests turned green: MACD signal, RSI crossover (DAY, day 1, and both day-2 tests) and RSI divergence. No non-golden test changed.
   - **Write-back.** `transferVars` ([filter-vars-helper.ts](src/run/filter-vars-helper.ts)) writes each computed var into the newest slot of `memories[period][key][symbol]`, when that memory exists (`recordHistory`). `adjustMemory` has already shifted the list for the bar. The write happens after each of the 5 passes, not once at the end, so a later pass sees the current bar's value: RSI from pass 1 feeds the crossover in pass 3, MACD from pass 3 feeds the signal and divergence in pass 4, and the signal feeds the crossover in pass 5. Price and volume are skipped, because `adjustMemory` still owns raw inputs.
   - **`adjustMemory`.** The `isMacd` case is gone, and the `default` case now sets the shifted-in slot to NaN, so a missed write reads NaN instead of last bar's value.
   - **The daily wipe.** `clearIntradayStateData` now resets lists to `new Array(space).fill(NaN)`, not `[]`. Before, the next write at `space - 1` turned `[]` into a sparse array, and `reduce`/`every` skip holes. That's how the day-2 RSI crossover got its vacuous 1s, and how an SMA seed after the wipe came out as roughly price/space.
   - **One test went from pass to fail, and the fail is correct.** "MACD(12,26) on 30-minute bars becomes valid using prior sessions" only passed because the sparse list seeded EMA26 with garbage. It stays red until item 11 (session policy).
   - **The MTSI memory path is deleted.** The resolver puts every MTSI intermediate (`mtsi{Numerator|Denominator}Vwap{p}`, `…Ema{m}`) into `vars`, so the write-back replaced the memory value before anything read it: pass 2 writes `mtsiVwap` before pass 3 seeds EMA1 from it, and pass 3 writes EMA1 before pass 4 seeds EMA2 from it. That made `adjustMemory`'s MTSI and EMA1 cases, `getVwap`, `vwapCheck`, the `length === 0` seeds and the `allVars` parameter dead. They're gone, along with the unused `rollAndAppend` and `trimConsecutiveUndefined` and the one unit test that covered the old path. The MTSI and VWAP test outputs are identical before and after the deletion, down to the mismatched values. `adjustMemory` now writes only price and volume, and sets every other newest slot to NaN. This closes the duplicate-path half of §1 MTSI (b).
4. **Fix the MACD crossover argument order. Done:** [filter-vars-helper.ts](src/run/filter-vars-helper.ts) now passes `periodsBefore, periodsAfter` to `hasBullish/BearishMacdCrossover` in the order they're declared. `VariableUtil` itself was already right. The name mismatch between the regex and the builder is fixed in Phase 1.5 step 4, and until then the filter path never computes the crossover, so the new test, [macd-crossover-engine.golden.test.ts](src/tests/golden/macd-crossover-engine.golden.test.ts), drives the real `DataHandler.processDataBackTest` with hand-filled MACD and signal histories and a key that matches the current regex. All 5 cases use `before ≠ after`, so all 5 failed before the fix and pass after. No other test changed.
5. **Fix Bollinger Bands (golden #2, #3). Done:** 2 golden tests turned green: the lower band, and BB on its own (which now also checks the lower band). No other test changed. The Bollinger-via-filter-path test stays red until Phase 1.5 step 4.
   - **One branch.** The separate Upper and Lower branches in `transferVars` ([filter-vars-helper.ts](src/run/filter-vars-helper.ts)) are now a single `isBollingerBands` branch that calls the existing, previously unused `VariableCalc.calculateBollingerBand` and assigns through `variableValue`. So the generic `if (shouldAssign)` no longer overwrites the lower band with NaN, both bands go through `recordHistory`, and the price list is read with optional chaining, so a missing price memory gives NaN instead of a `TypeError`.
   - **Memory reservation.** `calculateMemoryRequirements` ([memories-helper.ts](src/run/memories-helper.ts)) parses the period out of `bollingerBands{p}(Upper|Lower)` instead of using `extractTimeAgo`, which read 0.
   - **Still to do.** The key-naming mismatch (`…Multiplier{m}` vs `…(Upper|Lower)`) is fixed in Phase 1.5 step 4, because the multiplier has to be part of the key. Until then the multiplier is hard-coded at 2. The readiness check is item 6: `calculateBollingerBand` checks `prices.length`, which is always the full allocated size, so the band is NaN during warmup only because NaN spreads through the sum.
6. **Guard every windowed calculation (golden #4). Done:** 2 golden tests turned green: "RSI14 is NaN until 15 prices have been seen" and "MACD divergence matches reference".
   - **One readiness check.** A module-level `finiteTail(list, n)` in [filter-vars-helper.ts](src/run/filter-vars-helper.ts) returns the last `n` values only when all `n` exist and are finite, and otherwise returns null. Every windowed calculation reads its window through it instead of checking `list.length`, which is always the full allocated size: SMA, volume SMA, the EMA seed, RSI (`n = period + 1`), Bollinger Bands, the MACD signal seed, the MTSI EMA1/EMA2 seeds, both crossovers and both divergences. A crossover or divergence whose window isn't ready is now NaN instead of a vacuous 0 or 1.
   - **MACD divergence misalignment (new).** `calculateMemoryRequirements` reserved only `slowPeriod` bars of price for a MACD divergence, but the check slices `lookback` bars from both price and MACD. With 26 vs 30, prices and MACD values were compared 4 bars apart. Price memory is now `max(slowPeriod, lookback)` ([memories-helper.ts](src/run/memories-helper.ts)), and `finiteTail` refuses a short list, so the two can't drift apart again.
   - **EMA across a gap: accepted as is.** Every EMA chains from its previous var value and keeps going after a gap as if no bars were missing. This matches charting tools, which compute EMAs over bars, not clock time. Resetting would also make a 26-bar EMA unavailable for 26 bars after every halt. Revisit with item 11 if intraday state survives overnight.
   - **One test went from pass to fail, and the fail is correct.** "RSI14 on 30-minute bars becomes valid using prior sessions" only passed because RSI came out early from too few prices. A session gives at most 13 bars, and RSI14 needs 15. Like the MACD one from item 3, it stays red until item 11.
   - **One unit test fixture changed.** The MTSI EMA2 seed case in [filter-vars-helper.test.ts](src/tests/run/filter-vars-helper.test.ts) seeded from a memory of `[NaN, NaN]`. That only passed because the mocked SMA ignores its input. It now has one prior finite value.
7. **Fix the live paths:** track the last cumulative volume separately for volume and VWAP, and add the 3:59 DAY case to `LiveMasterJob.handleNewData`.
8. **Processing order (golden #5, §2.8):** sort periods numerically without mutating, `[...timePeriods].sort((a, b) => a - b)`. Within a period, update `vwapNumeratorCumulative` / `vwapDenominatorCumulative` before anything that reads them, so `vwap{p}` uses the current bar. The pass structure in `transferVars` is the stopgap; Phase 2's dependency sort replaces it.
9. **Gap handling (§2.4, golden #7):** in `BackTestHelper.getTestData`, feed `candles[index - 1]` only when its datetime is exactly one period before `datetime`, and otherwise skip the bar. In `adjustMemory`, replace the inline `copyWithin`/`fill` with one helper, `advance(list, units, value)`: throw if `units <= 0` (negative values make `copyWithin` count from the end and corrupt the list); if `units >= list.length`, fill the whole list with NaN; otherwise `copyWithin(0, units)` and `fill(NaN, len - units)` (the end defaults to `len`; today's `len - 1` end is exclusive and leaves a stale value in the last slot); then set `list[len - 1] = value` (price, volume, or NaN for a derived history, which item 3's write-back fills in). Use it in `adjustMemory`. Item 3 already did the ordering prerequisite: derived histories have a writer, and their newest slot starts as NaN, not stale. The wall-clock `unitsAgo` formula itself depends on the item 11 decision: if intraday memory survives overnight, it must count trading minutes. Phase 2's ring buffer later absorbs this helper as its append.
10. **Per-job symbol scoping:** pass the group into `prepare()`, and have each job keep its own symbol list and screen only those.
11. **Session policy. Decided in §6 step 2: carry across sessions (the first option).** Either warm intraday periods from prior sessions (extend `HistoricalWarmupService` to periods below DAY using minute candles) and stop wiping non-session indicators, or validate at init that each lookback fits within one session, the way `validatePercentileWindowLimit` does.
12. **Percentile:** build it *before* the daily clear, and replace the histogram with a sorted `Float64Array` searched by binary search (exact). Do both together: today the empty histograms send every lookup to the exact fallback, so building them without making them exact would make results worse, through the coarse 2% bins.
13. **RSI:** switch to Wilder's smoothing (stateful avgGain/avgLoss).

### Phase 1.5: parse variable keys once, stop round-tripping through strings
> **Superseded by §6.** The engine rewrite in §6 step 3 replaces string keys with indicator objects built from typed settings, so nothing parses keys back. This phase was a bridge for patching the current structure. It's kept here as a record of the problems the rewrite has to avoid.

**Keep the idea:** the canonical string key is the dedup identity (`filterVars[period][key][symbol]`). **Fix the round trip:** today a filter's typed params are turned into a string by the resolver and then recovered by regex in the helpers. That round trip is where the drift comes from.

Problems this fixes:
- **Two key producers.** `StrategyUtil.convertToVariableName` / `convertToCompareVarName` and `VariableBuilders` both build keys and disagree with `VariablePatterns`. Examples: the MACD crossover `Crossover${level}` vs `CrossoverPeriodsBefore` mismatch, and `bollingerBands{p}Multiplier{m}` ([strategy-util.ts:72](src/shared/utilities/strategy-util.ts#L72)) vs `bollingerBands{p}(Upper|Lower)` ([variable-patterns.ts:20](src/shared/utilities/variable-patterns.ts#L20)). The screener reads values through `convertToVariableName` while the engine computes them under the resolver's keys, which is what makes crossover and divergence filters crash (golden #1; Phase 1 item 2 is the stopgap). The UI's `macdSignalLine`, `vwap` and `volumeSma` also resolve to keys that match no pattern, and `convertToVariableName` drops the period for `vwap` and `volumeSma` (golden #6).
- **A param missing from the key makes two variables silently share one value.** Any param that changes the output but isn't in the key does this. The Bollinger key includes the multiplier, but `VariablePatterns.bollingerBands` has no slot for it, so "fixing" the name to match the pattern would create exactly this collision. RSI smoothing method and price source are future risks.
- **The opposite: a param in the key that doesn't change the output.** `level` in the MACD crossover key has no meaning for MACD/signal. `lookback` in the RSI divergence key is ignored, because the code slices `before + after`. Keys that differ only in such a param compute identical values twice. That's wasted work, not wrong results, but it's the same "key doesn't match meaning" problem.
- **Loose matching.** `isTsiFilter` uses `includes("tsi")`, which also matches `mtsi` (it only works because of the check order). `extractPeriod` takes whatever digits end the key, `parseMtsiVwapPeriod` matches `Vwap\d+` anywhere, and `isVwapNumeratorCumulative` uses `includes`.
- **Dependencies are hardcoded in the resolver** (e.g. MACD requests `priceEma{fast}` and `priceEma{slow}`) instead of living with the indicator.

Steps:
1. **Round-trip test first.** For each filter type, build its key, then assert that `classifyVariable(key)` returns the expected type and that a backtest produces a finite value for it. This should fail today on MACD crossover and Bollinger Bands. The golden test "UI dropdown values resolve to computable variables" already covers `bollingerBands`, `macdSignalLine`, `vwap` and `volumeSma`; extend it to every dropdown value and every filter type.
2. **Parse once at strategy load.** `resolveFilterVariables` returns `{ key, spec }` pairs, where `spec` is the typed params it already has. Store them in a single `Map<string, VarSpec>`.
   - **Specs for keys no filter asks for directly.** The resolver's dependencies (`priceEma{fast}`/`priceEma{slow}` for MACD), the VWAP cumulatives (`vwapNumeratorCumulative`/`vwapDenominatorCumulative`, which `StrategyRun.getCrossPeriodVars` creates), the MTSI intermediates (`mtsi{Numerator|Denominator}Vwap{p}…Ema{m}…`) and the history memories (`rsi{n}`, `macdFast{f}Slow{s}`, `…Signal{n}`) all need specs too. Whoever creates the key registers its spec. Otherwise the parsers can't be deleted.
   - **Catch collisions at load.** When a key is already in the map, assert that the new spec deep-equals the existing one, and throw otherwise. A `toKey` that drops a param then fails as soon as the strategy loads, instead of silently sharing values.
3. **Look specs up wherever keys are parsed today.** Replace the `VariablePatterns`/`VariableMatchers`/`VariableParsers`/`extractTimeAgo` calls with `specs.get(key)`. The full list of parse sites:
   - [filter-vars-helper.ts](src/run/filter-vars-helper.ts): `transferVars` and `validatePercentileWindowLimit`
   - [memories-helper.ts](src/run/memories-helper.ts): `calculateMemoryRequirements`, `adjustMemory` and `getVwap`
   - [strategy-run.ts](src/shared/classes/strategy-run.ts): `getCrossPeriodVars` and `getAdditionalPeriods` (`VariablePatterns.vwap.test` plus `substring(4)`)
   - [master-job.ts](src/shared/classes/master-job.ts): `runDailyMaintenance` (percentile keys)
   - [variable-check-back-test.ts](src/analysis/variable-check-back-test.ts)

   Delete the parsers once nothing uses them.
4. **One key producer: `toKey(spec)`.** Merge `convertToVariableName`, `convertToCompareVarName` and `VariableBuilders` into it. Nothing parses keys back. Rules:
   - Every param that affects the output appears in the key.
   - Every param that doesn't is removed from the key or made to work: MACD crossover `level`, RSI divergence `lookback`.

   This step also lands the naming fixes deferred from Phase 1. The MACD crossover key drops `level`, which turns its golden tests green together with Phase 1 items 3 and 4. The Bollinger key carries period, multiplier and band. The UI's `bollingerBands`, `macdSignalLine`, `vwap` and `volumeSma` get keys with their periods (golden #6). That also means adding the missing period inputs in the frontend's `filter-util.tsx`.
   - **Before changing the key format, check whether key strings are stored anywhere.** Strategies are stored as filter JSON (typed params), so they should be safe. Not yet checked: run logs, analysis output and `src/tests/expected-test-results`.

After this, Phase 2 is mostly adding `deps` and `update` to each `VarSpec` type. `filterVars` keeps the same string keys throughout, so dedup and lookups don't change.

**Don't count this phase as a performance win.** A map lookup is cheaper than the roughly 10 regex tests it replaces, but the larger hot-path costs stay: five passes over every key for every symbol on every tick, and copying vars into each strategy (`assignProperties`). Phase 2's single dependency-sorted pass and scoped read-only views remove those.

### Phase 2: indicator registry refactor (§3 target), with the Phase 1 golden tests as the safety net.
### Phase 3: `MarketDataProvider` / `Broker` interfaces and the bar normalization layer.
### Phase 4: repo split and signal sinks (email or push), with paper positions for exit signals.

> **Phases 2 to 4 are reordered and expanded in §6.**

---

## 6. Revised order (November 2026)

### What changed
- **No trading for users.** The public app sends signal alerts only. Real-money trading, the position risk monitor and the trading dashboard move to the private repo.
- **Self-hosted first.** Developers run their own copy, locally or on their own server, with their own data access: a Massive key or their own Schwab developer app. Each copy has one user. Market data licensing rules out a hosted intraday site on an individual data plan (see [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md) §1.4).
- **Two clients.** The browser uses the REST API. Claude uses an MCP server. Both call the same service layer.
- **Hosted daily-data version later.** It would use a commercial end-of-day data license, from the same codebase with different config.
- **Two deployment profiles, one codebase (decided 22 November 2026).** Self-hosted and hosted differ only in configuration, never in forks or `if (hosted)` checks:
  - **Data credentials belong to the install, never to a user.** Self-hosted, the operator is the only user and puts their own Schwab, Massive or Alpaca access into the install's settings, as the Schwab sign-in already works. Hosted, the operator's licensed vendor key is used and users never enter credentials. This rules out per-user "bring your own data" on the hosted site (PRODUCTION-READINESS.md §1.4 option 1) and keeps the shared candle fetch simple.
  - **Each `MarketDataProvider` declares its capabilities:** which periods it serves, real-time or delayed, and whether prices may be shown to users (for example in alert emails). Strategy validation, the UI and email templates read these, not the profile. An end-of-day provider then rejects intraday strategies by itself.
  - **Every behavior difference is a named setting.** `DEPLOYMENT=self-hosted|hosted` only picks the defaults, and each setting can be overridden on its own. Code reads the setting (`settings.backTestsPerUser`), never the profile.

    | Setting | Self-hosted default | Hosted default |
    |---|---|---|
    | Sign-up | first user only | open, with email verification |
    | Back tests running at once per user | no limit | 1–2, then 429 |
    | Back-test worker pool | cores − 1 | sized to the server |
    | Alert email | the operator's own SMTP or Mailgun | the shared provider, with unsubscribe and bounce handling |
    | Candle cache | per install | shared, if the license allows |
  - **Hosted-only operations** (billing, the vendor account) can live outside the public repo, like the trading code.
  - **Open question before building the hosted version:** whether the vendor's end-of-day license allows multi-year back tests and alerts that name a symbol. That decides which features the hosted profile turns on.
- **The engine can be simpler.** With one user per copy, sharing work across strategies is no longer the scaling argument. Keep sharing as a simple map keyed by typed settings, and drop the machinery around string keys.

### Order
1. **Tag the current version for personal trading. Done:** the annotated tag `personal-trading` is on `master` of the private archive repo, which is local only and not pushed. Keep running your own setup from the tag until the new engine replaces it. The Phase 1 work above was done on the archive's `refactor` branch and then moved to this repo as patches, with the same golden results (35 pass, 25 fail).
2. **Write the remaining behavior decisions as golden tests. Done:** golden results are now 35 pass and 26 fail. Each item has a failing test that states the expected behavior:
   - **Session policy (Phase 1 item 11). Decided: carry indicators across sessions.** Indicators run over bars, not clock time, as charting tools do. Warmup loads prior sessions' intraday bars, and the overnight gap is skipped, not filled with NaN. The existing tests already state this: "RSI14 / MACD(12,26) on 30-minute bars becomes valid using prior sessions" and "percentile with sessions=2 uses the previous session on day 2". There's no "reset at session open" setting. Add one later only if ignoring overnight gaps is wanted as a feature.
   - **Wilder's RSI (item 13):** "RSI matches technicalindicators (Wilder's smoothing)".
   - **Live volume handling and day-period timing (item 7):** the §2.5 and §2.6 live tests.
   - **Gaps in the back-test data feed (the `getTestData` half of item 9):** the new "after a gap, the feed skips a bar instead of handing over a stale close". At 10:08, after a 10:00–10:07 gap, the feed currently hands over the 09:59 candle. The probe strategy in the harness now records every bar it's given (`fed`), so the test checks the feed itself, not values derived from it.
   - **Effect on the back-test integration tests.** Carrying sessions over changes `back-test-half-hour-results.json`: `percentchange` at 9:30 and 10:00 now compares against the previous afternoon instead of NaN, so overnight moves can open or close trades. The daily results don't change. These files record old behavior and aren't a spec. After step 3, regenerate them with `UPDATE_EXPECTED=1` and review the added and removed trades before committing. Write a small comparison script for that review, because the raw JSON diff is thousands of lines.
3. **Rewrite the engine core. Done.** All golden tests pass, and so does every non-integration suite. The back-test integration results are regenerated and reviewed. This replaces Phase 1.5 and Phase 2.
   - **Where it lives.** [src/engine/](src/engine/):
     - `specs.ts`: a typed `IndicatorSpec` union and `keyOf(spec)`, the one key producer.
     - `filter-specs.ts`: `filterVariables(filter, period)`, the one place a filter's params become specs.
     - `indicators.ts`: one small streaming class per indicator. Each keeps its own state.
     - `engine.ts`: `IndicatorEngine`, one instance per (symbol, period, key).
     - `bars.ts`: `duePeriods`, `candleToBar` and `QuoteBars`, the boundary.
   - **Deleted:** `filter-vars-helper.ts`, `memories-helper.ts`, `data-handler.ts`, `variable-patterns.ts`, `filter-variable-resolver.ts`, `variable-util.ts`, `variable-calculations.ts`, `run-util.ts`, the key helpers in `StrategyUtil`, histograms and `runDailyMaintenance`. The daily wipe is gone too.
   - **How a tick works.** `duePeriods(t)` picks the periods whose bar closes now. Backtest and live share it, so DAY closes at 15:59 in both (§2.6). Those bars go to `engine.onBars`. Each strategy on a due period gets its values copied in, then runs on its own symbols only (Phase 1 item 10).
   - **Ordering.** Dependencies are created before the indicators that use them, so creation order is update order. That covers cross-period VWAP (§2.8) and replaces the five passes.
   - **Gaps.** A bar missing inside a session calls `skip()` on that period's indicators. Windowed indicators turn NaN, and recursive ones carry on. The overnight gap is skipped.
   - **Live and warmup.**
     - Live quotes become bars in `QuoteBars`, which turns cumulative volume into per-bar volume (§2.5).
     - `HistoricalWarmupService.warm` replays history through a scratch engine for every period, intraday included, up to the current minute. Then `LiveMasterJob.addJobs` copies state only into indicators it just created, so indicators already running keep theirs.
     - A second user's group is registered with that user's symbols (§2.7).
   - **Feed fix (item 9).** `BackTestHelper.getTestData` hands over the candle that started one period before `t`, or nothing. If the next candle is missing, the trade fills at the bar's close.
   - **Behavior changes, each pinned by a test:**
     - RSI uses Wilder's smoothing (item 13).
     - The RSI divergence window is `lookback`, as MACD's already was. It used to be `before + after`.
     - Divergence keys drop `before`/`after`, which never did anything. The MACD crossover key drops `level`.
     - The Bollinger key includes the multiplier and the band. Filters take `band` (upper, middle or lower; upper by default).
     - The percentile is an exact rank over a sorted window of the last `sessions` sessions. For intraday periods it skips changes that span the overnight gap.
     - MTSI no longer turns ±100 into NaN.
     - TSI is computed.
     - Bad settings, and variables nothing computes (`adx`, `volumechange`), throw when the strategy loads. They used to be NaN forever.
     - A compare variable that's NaN makes the filter false. It used to fall back to `compareVal`.
     - Strategies see only the variables they read, not dependencies.
   - **Speed.** 100 symbols × 5 sessions of 1-minute bars × 3 strategies take 6.5 s, down from 42.9 s on the old engine. The percentile rank uses binary search.
   - **Left for later:**
     - Indicators for ended live jobs keep computing.
     - `FilterGroup.resolveOperator` treats a value of 0 as false and has no `==`.
     - ~~The UI still offers `adx` and `volumechange` and has no period inputs for VWAP and volume SMA (step 9).~~ Fixed in step 9.
   - **Back-test integration results. Regenerated and reviewed (November 2026).**
     - **How they were run.** Both engines ran against the same Schwab candles: the old one at `e910fd6^`, the new one at `HEAD`. Each ran in its own worktree with `UPDATE_EXPECTED=1`. The token came from the local token server (`npm run set-access-token`, port 2000), selected with `AWS_URL=http://localhost:2000` on the command line. The EC2 host isn't needed. Polygon is not an option, because there's no active subscription.
     - **Comparison.** `node util/compare-backtest-results.mjs <before> <after>` reports the trades added, removed and changed for each strategy. Both arguments can be files or folders.
     - **Data drift check.** The old engine on fresh data reproduced the committed files exactly, so every difference below comes from the engine.
     - **`back-test-day-results.json` and `analysis.json`:** unchanged.
     - **`back-test-half-hour-results.json`:** 289 trades became 465. 212 are the same and none changed exit.
       - 253 trades were added, entered at 10:00 (215) or 10:30 (38). Carrying sessions over makes `percentchange` over 2 bars valid on the first bars of the day, compared against the previous afternoon. The old engine reset each session, so its earliest entry was 11:00.
       - 77 trades were removed, all at 11:00 or later. Each one is blocked by an earlier entry in the same symbol that day that is still open.
     - **Date range.** The 30-minute test's range (June–October 2026) has to stay within Schwab's roughly 8 months of intraday history. Move it before about February 2027.
4. **Build the data provider layer (Phase 3).** Put Massive and Schwab behind one interface. Add a built-in Schwab sign-in flow so the app no longer depends on the personal AWS token service.
   - **Schwab sign-in: built.**
     - **Where it lives.** [src/providers/schwab/schwab-auth.ts](src/providers/schwab/schwab-auth.ts) owns the OAuth tokens:
       - Sign-in by authorization code. The redirected URL is pasted back, because the registered callback `http://127.0.0.1` has nothing listening and changing it would send the Schwab app back through approval.
       - The refresh token and its sign-in time are stored in the `properties` table.
       - The 30-minute access token is kept in memory and refreshed on demand. Concurrent callers share one refresh.
     - **Entry points:**
       - `npm run schwab-login` (CLI).
       - `/api/schwab/{status,authorize-url,sign-in}`, which the step 9 settings page will use.
       - `GET /schwab-token`, loopback only, for elliott-wave-trader.
     - **Failure handling:**
       - A rejected refresh token throws `SchwabSignInRequiredError`, whose message says how to sign in.
       - Startup logs the sign-in state and keeps booting.
       - A warning is logged once a day when fewer than 2 days are left.
     - **Transition.** On first use, the refresh token is seeded from `.env` `REFRESH_TOKEN`, with an unknown sign-in time.
     - **Removed:** `util/set-access-token.mjs`, its pm2 entry, Selenium, `AWS_URL`, `resetAccessToken`/`reCheckAccessToken`, and the Schwab token retry on Polygon calls.
     - **Not done yet:** a Docker guard for `/schwab-token` (step 10). The expiry warning and a rejected refresh token now send alerts through the step 6 outbox.
   - **Provider interface: built.**
     - **Interface.** `MarketDataProvider` in [src/providers/market-data-provider.ts](src/providers/market-data-provider.ts) has `getCandles`, `getQuotes` and `isMarketOpen`. There are two providers: [SchwabMarketData](src/providers/schwab/schwab-market-data.ts) and [MassiveMarketData](src/providers/massive/massive-market-data.ts). `MARKET_DATA_PROVIDER` picks one (`schwab` or `massive`, default `schwab`). The older `CANDLE_SOURCE` still works, and `polygon` means Massive.
     - **What uses it:** back-test candles (and with them, warmup), live quotes (`DataRetriever`), and the scheduler's market-open check. Trading code keeps calling `SchwabAPI`, which now uses [SchwabClient](src/providers/schwab/schwab-client.ts) for signed-in requests. There's no `Broker` interface, because trading leaves the public app in step 7.
     - **Normalization** ([src/providers/candles.ts](src/providers/candles.ts)). Daily candles go from each provider's midnight stamp (Central for Schwab, Eastern for Massive) to 15:59 Eastern on the same trading date. It uses `Intl` time zones, so the machine's time zone and the current DST state no longer matter. This replaces `adjustDailyCandleTime` and its offset guessing. The characterization snapshots are unchanged except for error wording.
     - **Batching and limits** moved into the providers. Schwab sends 195 quotes per request with 100 ms between requests, and 250 history requests per batch with 10 s between batches. Massive asks for up to 250 snapshot tickers per request.
     - **Checked:** all non-integration suites, the UTC characterization run, and the back-test and analysis integration suites on Schwab. The integration results are unchanged for both DAY and 30-minute bars. Live quotes and the market-open check run through the provider against Schwab.
     - **Not checked against the real service: Massive.** There's no subscription to test with, so it's built from Massive's documented responses (`/v2/aggs`, `/v2/snapshot/.../tickers`, `/v1/marketstatus/now`) and covered by unit tests only. Snapshots and market status may need a paid plan. Minute aggregates include pre-market and after-hours trading, so the Massive provider keeps only candles starting from 9:30 up to 16:00 Eastern ([regularSessionOnly](src/providers/candles.ts)). Schwab is asked for regular hours only. Settings: `MASSIVE_API_KEY` (falls back to `POLYGON_KEY`) and `MASSIVE_API_URL` (default `https://api.massive.com`).
     - **Not moved yet:** the charts and earnings helpers in `stock-data-util.ts` and the history import in `util-router.ts` still call Schwab directly. They go to the private repo in step 8.
   - **Hourly bars fixed.** Providers have no hourly candles that start at :30, so hourly bars come from 30-minute candles. The old code kept only the :30 candle of each hour. So the 10:30 bar was really 9:30–10:00: its close was 30 minutes old, and its high, low and volume covered half the hour. [toHourlyCandles](src/providers/candles.ts) now merges each :30 candle with the :00 candle after it. The session's last half hour (15:30–16:00) stays a half bar; it's only used for the 15:30 fill price.
     - **Effect:** every 60-minute back-test, warmup and analysis result changes. Only the 16 hourly characterization snapshots changed. None of the integration fixtures use 60-minute bars, so none changed.
5. **Run a baseline load test before fixing anything.** Simulate users creating strategies and running back tests, and record latency and errors. These are the "before" numbers.
   - **Done:** see [LOAD-TEST.md](LOAD-TEST.md). The test uses its own `stock_app_loadtest` schema and recorded candles, through a new `recorded` data provider.
     - **Results:** no errors. Back tests block the server. A medium back test (25 symbols, 30-minute bars, 3 months) takes 390 ms on its own, and throughput levels off at about 2.5 per second, one CPU core's worth. At 10 users, a 4 ms read waits up to 2.5 s, and the probe got 71 answers in about 60 s instead of 240.
     - **Implication for step 6:** database requests take 4–6 ms, so the connection pool is mainly a correctness fix. Moving back tests to workers is the change that should show up in the "after" numbers.
6. **Add the service layer and fix the server.** Move logic out of route handlers into services, so REST routes and MCP tools call the same code. Then, in order (details in [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md)):
   - Parameterized SQL (§1.1).
   - Ownership checks on every table (§1.2). Done for groups, strategies, runs, back-test results, transactions and analyses (see Progress).
   - The connection pool (§2.3). Done (see Progress).
   - Back tests in a worker (§2.1), with the settings module and deployment profile defaults it needs (§6 "Two deployment profiles"). Done (see Progress).
   - Provider capabilities (periods, real-time or delayed, price display), checked in strategy validation. Done (see Progress); emails and the UI don't read them yet.
   - Scheduler resilience and the overlap guard (§2.5, §2.6). Done (see Progress).
   - Reloading active runs at startup (§2.7). Done (see "Runs reload after a restart" under Progress), except open positions inside a run, which wait for paper positions (Phase 4).
   - The alert outbox behind a notifier interface (§2.4). Done (see Progress).

   Rerun the load test after the connection pool and worker changes to get the "after" numbers.
   - **Progress.** The service layer and placeholders are being done one domain at a time. Services live in `src/services/`, take the caller's user id as their first argument, validate their input, and throw `Error400`/`Error404`. Routes only read the request and send the result. Repositories use `DatabaseAPI.query`/`insert`/`modify` with `?` placeholders.
     - **Groups: done.** Update and delete now check the owner. Before this, any logged-in user could change or delete any group. Deleting several groups removes all of them or none, and someone else's group gets a 404.
     - **Strategies: done.** Update and delete now check the owner, and validation moved from middleware into `strategy-validation.ts`, which the service uses.
       - Bugs fixed along the way: `get-by-name` always read user 2's strategies, and `checkStrategiesExist` assigned instead of comparing, so it always said yes.
       - The frontend calls `/getByName`, which had no route, so that path is now an alias.
     - **Users: done.** Sign-up and login moved into `UserService`, and the login query uses a placeholder. Before, a username like `x' or '1'='1` matched every user. That's the injection §1.1 describes.
     - **Error responses: done.** Unexpected errors (MySQL, axios, bugs) are logged on the server, and the client gets only `{ statusCode: 500, message: "Internal server error" }`. Before, raw MySQL messages, including SQL syntax errors that show the query, reached the browser. Our own 4xx messages still go through. Malformed JSON bodies now get a 400 instead of Express's stack-trace page. "Schwab sign-in required" is a deliberate 503.
     - **Runs and back tests: done.** `RunService` handles back tests, live runs (simulations and real strategies), pause, resume, end, run lists, vars and saved results. You can only run your own strategies on your own groups, and a run or result belongs to whoever owns its strategy. No `user_id` column was needed: both tables have non-cascading foreign keys to `strategy`.
       - Before, any logged-in user could pause or end anyone's run, list everyone's runs, back test anyone's strategy, and read anyone's results.
       - Pause, resume and end now check the run's status (you can't resume an ended run) and its type. Ending a run stamps `end_time`.
       - Run ids from the body are parsed as numbers. A string id used to match nothing in memory because `LiveMasterJob` compares with `===`.
       - Runs are inserted one row at a time and read back by id, so `LAST_INSERT_ID()` and `runTwoStatements` are gone, and **`multipleStatements` is off**.
       - `max_drawdown` is now saved with each back-test result. It was computed but dropped.
       - Removed the dead `LiveJobRunner.clean()` and the strategy, group and run middleware it replaced.
       - The simulation warmup integration test runs its own copy of the seeded (ownerless) strategy and group. It also read `masterJob.allVars`, which the indicator engine replaced. It had been failing since then and now reads the engine.
     - **Fixes from an agent review of the above.**
       - Turning off `multipleStatements` (`bc9cc0b`) broke updating an existing position rule. `PositionsRepository.upsert` sent an UPDATE and a DELETE joined by `;`. My search for multi-statement SQL missed it because the `;` sat between two template variables. Both now run as separate queries. The whole repository uses placeholders and rejects non-numeric prices and non-boolean `is_active`, and four unused methods are gone.
       - A malformed, tampered or not-yet-valid JWT returned 500 instead of 401. The frontend only logs the user out on a 401, so someone with a stale token was stuck. A missing token was a 400 and is now a 401 too. The old test mocked `jwt.verify`; the new one uses the real library.
       - A second review of those two fixes found nothing important. Follow-ups done: the duplicate cleanup now runs before the update. An older duplicate could hold the option spelling being written, with or without spaces, and trip the unique key. Blank price strings now count as not set, and only plain decimals are accepted. Tests added: unit tests for option, `is_active` and price parsing, router tests for `PATCH` and `DELETE /api/trade/position-rule`, and `positions.integration.test.ts` against real MySQL. That integration test fails on the old order.
     - **Transactions: done.** `TransactionService` and a thin `transaction-router.ts` serve `/api/transaction/simulation` and `/real` with the same response shapes. A transaction belongs to the owner of its run's strategy (`transaction_* → live_job → strategy.user_id`), and other users' run ids are left out. Before, any user could read any run's trades, and `runId` was pasted into `in (...)`, so `runId=0) union select …` could read other tables.
       - **Recording had never worked.** The insert named the column `long` without backticks, and LONG is reserved in MySQL 8, so every insert was a parse error. `new_schema` had zero transactions. The calls aren't awaited and Node exits on an unhandled rejection, so a simulated sell likely crashed the server. Recording now uses placeholders and logs failures instead of rejecting.
       - **Simulated trades still weren't recorded** after that fix (found in the alert outbox review): `StrategySimulation` passed a `runId` field that was never set, so every insert had run id 0, which `record` refuses. It now uses the run's id.
       - `net_percent_gain` was `DECIMAL(3,2)`, which rejects any trade of ±10% or more. The new changeset `db/widen-transaction-percent.sql` widens it to `DECIMAL(9,4)`. Applied to `new_schema` and `stock_app_loadtest` by hand (same statements, so Liquibase re-applying it is harmless).
       - The response now includes `runId`, which the frontend groups by (`run-strategies.tsx`) but the mapper had dropped, and gains come back as numbers rather than DECIMAL strings.
       - Removed the unused `getTotal`, `getTransactionsForRun` and `updateTransaction`, and the transaction middleware. Added `transactions.integration.test.ts`.
     - **Analyses: done.** `/api/analysis/get-data` and `/check-variables` load the group with `getOwnedGroup`, so another user's group is a 404 ("stock group not found"), the same message as a missing one. The request middleware's own group check, which used any user's group and answered `<id> not found`, is gone. So are the unused `ScreenerJobService.getGroup` and `StockGroupRepository.getSymbolsFromGroupById`. `analysis.integration.test.ts` covers the cross-user 404 for both endpoints.
     - **Runs reload after a restart: done.** `RunService.restoreRuns(bootTime)` starts in the background after boot (`start.ts`, after the position monitor, not awaited). It loads active and paused simulations that started before boot, one owner and group at a time, through the normal warm-up, and they come back as they were.
       - **Real-money runs are ended at restart.** An agent review showed they can't resume safely: their open positions, pending orders and cancel list live only in memory, so a reloaded run would count its own positions as pre-existing (never exiting them) and sell anything bought by hand since the restart. Start them again by hand after checking the account.
       - Runs nobody can control are ended: strategy missing or without an owner (the 10 test leftovers in `new_schema` on the seed strategy), or strategy and group no longer the same user's.
       - If a group fails to load (e.g. Schwab not signed in), its rows are left as they are. `/current-simulations` and `/current-strategies` include `loaded`; pause and resume answer 409 for a run that isn't loaded, and end always works, including during warm-up (the runner skips a run ended while it was warming up).
       - A start that fails after inserting its rows (warm-up error) now ends those rows.
       - `notify_on_entry` is stored on `live_job` (changeset `live-job-notify-on-entry`, which skips itself if the column exists), so a reloaded simulation keeps its email setting. Applied by hand to `new_schema` and `stock_app_loadtest`.
       - Fixed on the way:
         - `runJobs` checked a master job it read before the warm-up `await`, so two overlapping starts each built a new master job and the first one's runs were lost.
         - `RealMoneyStrategy` loaded the account's existing positions in an uncaught promise, so with Schwab signed out building one exited the process. It now never rejects, and the run skips every tick (no trading, no closing "unexpected" positions) until the list has loaded, retrying each tick. Without that, an empty list would have made `syncPositions` sell the whole account.
       - **Not covered:** a simulation's open positions live only in memory, so after a restart it forgets them and never records their exits. That needs paper positions in the database (Phase 4).
       - **Still open (pre-existing, real-money only):** each real run snapshots the account when it starts and later sells any position it doesn't recognize. So a position bought by hand, or opened by another real run started earlier, is sold as "unexpected" while a real run is active. Goes away with the step 7 redesign.
     - **Connection pool: done.** `DatabaseAPI` now uses `mysql.createPool` (`DB_POOL_SIZE`, default 10; `multipleStatements` still off). `createConnection` checks that one connection opens, so bad credentials still fail at startup. A lost connection is retried once on a fresh one, except inside a transaction.
       - The only transactions are the integration tests' rollback sandbox. While one is open, every query runs on that pinned connection, so the tests behave as before.
       - Removed the unused `test` flag of `createConnection`, `closeDBConnection` (a duplicate of `closeConnection`) and the commented-out AWS connection code.
       - Queries from different requests can now run in any order. The reload at startup already filters on boot time instead of relying on one connection's order.
       - Load test (LOAD-TEST.md, "After the connection pool"): typical reads no longer queue; the tails are still the back tests. An apparent slowdown in deleting a strategy was rechecked: same tail on the old code, and no row-lock waits.
       - Agent review fixes: closing waits for a pool or transaction that is still opening, so neither comes back after the close. A second transaction is refused while one is opening, and the rollback waits for it. A connection whose begin or rollback failed is closed, not returned to the pool. A lost connection is retried only for reads (`select`/`show`), since a write may already have run; a "closed state" refusal is retried for any query, since nothing was sent.
       - Integration test setup hooks now get 60 s instead of Jest's 5 s default. When the Schwab check hung, setup timed out and Jest ran the cleanup while setup was still opening the pool and transaction. Cleanup now always closes the pool, even if the rollback fails. `historical-warmup` and `back-test-helper-it` never closed the pool that `SchwabAPI.initialize()` opens to read the sign-in, so a single-process run (`--runInBand`) never exited; both now close it.
     - **Back tests on worker threads: done.** `BackTestPool` (`src/run/back-test-pool.ts`) runs strategy back tests, analyses and variable checks on worker threads; the HTTP API is unchanged (the request waits for the result).
       - The main thread checks ownership and sends a plain `BackTestTask` (strategies, filters or variables, the group and the time range). The worker builds the jobs, fetches the candles and runs them, so the network fetch and JSON parsing leave the main thread too.
       - The worker asks the main thread for the Schwab token (`SchwabAuth.delegateTo`), so there is still one sign-in and one refresh. A `BaseError` keeps its status across the thread boundary, so 400s, 404s and the Schwab sign-in error reach the client unchanged.
       - Settings (`src/shared/settings.ts`): `BACKTEST_WORKERS` (default cores − 1, at most 4; `0` runs on the main thread), `BACKTEST_MAX_PER_USER` (running or waiting; 429 past it), `BACKTEST_TIMEOUT_MS` (stops the worker, 503). `DEPLOYMENT=hosted` turns on a limit of 2 per user and a 5-minute timeout; self-hosted has no per-user limit and 10 minutes. This is the first use of the deployment profiles.
       - A crashed or timed-out worker fails only its own task and is replaced. Idle workers don't keep the process alive. `ScreenerJobService.setUpAnalysisBackTest` became `getOwnedGroup`.
       - Load test (LOAD-TEST.md, "After back-test workers"): at 10 medium users the probe answered all 246 requests (p95 4 ms, was 765 ms before step 6), reads stay at 4–5 ms p95, and 134 back tests completed (99 before), with a p95 of 433 ms.
       - Not moved: the warm-up when a live run starts (`HistoricalWarmupService`) still runs on the main thread. A client that disconnects doesn't cancel its back test.
       - Agent review fixes: the pool reads the settings once per `run` (or `start`) and reuses them, so a bad value fails only that call and can't throw inside a worker event. A worker that can't be started, or a task that can't be sent to it, fails only that task. `DEPLOYMENT` accepts only its two values (it accepted `constructor` and the like, which left every back test waiting forever). `BACKTEST_TIMEOUT_MS` is capped at Node's longest timer, since a longer one fires at once. `backtest_result.runtime_ms` is the worker's own time, not counting the wait for a free worker.
       - `tslib` moved to `dependencies`: the build needs it (`importHelpers`), and `npm start` installs production dependencies only, so the built app couldn't start. This predates the workers.
     - **Scheduler: done.** `StrategyScheduler` ([src/run/strategy-scheduler.ts](src/run/strategy-scheduler.ts)) was rewritten as one timer that fires 1 s after each minute boundary and sets the next one. It runs the live master job on each minute from 9:30 to 15:59 Eastern, weekdays, on days the provider says the market is open.
       - **Before:** any error from a tick cleared the minute interval, so one network blip or an expired token stopped every run until the next day. A failed market-open check (asked once a day) lost the whole day, and an error in the daily check stopped it for good. The daily check was a 24-hour interval from the first start, so after a daylight-saving change it fired at 8:30 or 10:30. Ticks fired at whatever second the server started, drifted, and could overlap.
       - **Now:**
         - A failed tick is logged and the next minute runs. After 5 failures in a row it sends an alert, and another when ticks recover (through the alert outbox).
         - A tick counts as failed when a period is due and no quotes come back. Schwab's `getQuotes` now throws when every batch fails (it used to return `[]`), so an expired sign-in or an outage shows up as failures instead of quiet "no data" ticks.
         - Two ticks never run at once. A minute that starts while a tick is running waits and runs as soon as that tick finishes, so a slow 15:58 doesn't cost the day's DAY bar. Only the latest waiting minute is kept, and any it replaces is logged as not run. After 5 waiting minutes in a row it logs that a tick may be stuck.
         - The market-open check is made on the session's first minute. A failure or a "closed" answer is asked again the next minute, so a status that lags at 9:30 costs one minute. "Open" is kept for the day. Weekends make no calls.
       - `LiveMasterJob.run(time)` takes the minute's start and stamps the quotes with it, matching the back test: at time T both use the bar that closes at T (the back test hands over the candle that started one period before T).
       - One strategy's error, thrown or rejected, is logged and doesn't stop the others. A real-money run is async and nothing awaits it, so if its previous minute is still going it skips this one instead of running twice at once (it could have placed duplicate orders).
       - Removed the `SchwabAPI.testAccessToken()` call at the start of every tick: an extra Schwab request each minute, and it required a Schwab sign-in even with `MARKET_DATA_PROVIDER=massive`. Providers refresh the token themselves.
       - Market-data reads (Schwab GETs and Massive) time out after 30 s (`READ_TIMEOUT_MS`), so a hung request can't hold up the ticks. Orders have no timeout, since one that timed out might still have been placed.
       - An agent review found the issues fixed above. It also said live bars are a minute behind the back test's; that's wrong for intraday bars (see the `run(time)` point above).
       - Not handled:
         - A live DAY bar uses the price at 15:59:01, about a minute before the close the back test uses. Before, it was whatever second the server started in.
         - Early-close days (13:00) still tick until 16:00 on stale quotes, as before.
         - The position monitor (trading, leaving in step 7) keeps its own timers.
     - **Alert outbox: done.** Alerts are stored in `alert_outbox` (changeset `alert-outbox`, applied by hand to `new_schema` and `stock_app_loadtest`) and sent by `AlertOutbox` ([src/notify/alert-outbox.ts](src/notify/alert-outbox.ts)), not by the code that raises them.
       - **Before:** a simulation's entry alert was sent from inside its entry step, one Mailgun call (and a Twilio call) per signal, with no timeout and no retry. A failure was only written to the run's log file.
       - **Rows.** `AlertOutbox.enqueue` stores one row per configured channel, so a retry of a failed text never sends the email again. A row has the kind (`entry` or `system`), the run, the user (the run's strategy owner, looked up in the insert), subject, body, status, attempts and the next attempt time. An optional dedup key is unique per channel. `enqueue` never rejects; with no channel configured it stores nothing.
       - **Sending.** The sender starts at boot and sends due rows right after an enqueue and every 5 s, 20 at a time, with email and text sent side by side.
         - Each row is claimed before it's sent: its attempt is counted and its next try is set to the backoff (30 s, doubling to at most 30 minutes). So if the result can't be written afterwards, the row comes back after its backoff, at most 8 times, rather than every poll.
         - The providers' own requests time out at 10 s, with a 15 s backstop. After 8 attempts (about 1.5 hours) the row is marked `failed`.
         - Only the error message is stored, since an axios error carries the API key.
         - Rows survive a restart. Delivery is at least once: a crash, or a failed status write, between sending and marking a row sent sends it again after its backoff.
       - **Notifiers.** `Notifier` ([src/notify/notifier.ts](src/notify/notifier.ts)) has one method, `send({ subject, body })`. `MailgunNotifier` (`MAILGUN_API_URL` selects the EU region) and `TwilioNotifier` read the same settings as before. Texts carry the body only, cut to Twilio's 1600 characters. Each channel is set up separately, so a bad Twilio setting turns off texts and logs why, but email still goes. Recipients are still the install's `NOTIFY_EMAIL_TO` and `NOTIFY_SMS_TO`: one user per self-hosted copy.
       - **What sends alerts:**
         - A simulation entering a position, when the run was started with notifications on.
         - The scheduler, after 5 failed minutes in a row, on recovery, and when a tick seems stuck.
         - The Schwab sign-in, when it has under 2 days left (once per sign-in) and when Schwab rejects the refresh token.
       - `EntryNotificationService` is gone. Entry alert times are now shown in Eastern time rather than the server's zone.
       - Checked end to end against MySQL with a fake Mailgun server: an alert sent at once, a 500 scheduled a retry 30 s later, and the retry was marked sent.
       - An agent review found the issues fixed above: unbounded resends when the status write failed, a bad Twilio SID turning off email too, the send timeout racing the providers' own, a wake that could be dropped at the end of a pass, `stop()` not stopping a backlog, and a dedup key that dropped a second entry in the same bar (it now includes the order type).
       - Not done:
         - Throttling and digests for busy 1-minute strategies (step 7, with exit alerts).
         - An alert history page or API (step 9 or the MCP server).
         - Per-user recipients, unsubscribe links and bounce handling for the hosted profile (PRODUCTION-READINESS.md §1.3).
         - SMTP as an alternative to Mailgun.
         - The position risk monitor still sends its own texts; it's trading code and leaves in step 7.
     - **Leftovers (Lane B, done in parallel with step 7):**
       - **Background work after an integration test: done.**
         - Once a suite has opened a transaction, `DatabaseAPI` refuses queries outside it: after the rollback, after the close, and even after a reopen.
         - It also refuses any query after `closeConnection` until `createConnection` is called again, instead of opening a new pool.
         - Each refusal is logged with `console.error` and rejects.
         - A query sent while the transaction is opening waits for it.
         - Suites with live runs still call `stopAll()` first. A tick already in flight is caught by the refusal.
         - The outbox sender only runs after `AlertOutbox.start()` (boot), so integration suites don't trip it.
       - **Deleting with run history: done.**
         - Deleting a strategy or group that has runs or saved back-test results answers 409 and names them, e.g. `"Gap up" has 2 runs and 1 saved back-test result`.
         - Nothing is deleted, and history is kept.
         - A run added between the check and the delete trips the foreign key and gets the same 409.
         - Tests: `delete-with-history.integration.test.ts`.
       - **Back-test queue: done.**
         - `BACKTEST_MAX_WAITING` (self-hosted 20, hosted 50) caps how many back tests wait for a worker.
         - `BACKTEST_MAX_WAIT_MS` (self-hosted 5 min, hosted 1 min) caps how long one waits.
         - Past either limit the request gets a 503. Neither applies when `BACKTEST_WORKERS=0`.
         - Before the next load test, set `BACKTEST_MAX_WAITING=0` for numbers comparable with LOAD-TEST.md.
       - **Provider capabilities: done.**
         - Each `MarketDataProvider` declares the periods it serves, real-time or delayed, and whether prices may be shown:

           | Provider | Periods | Real time | Prices shown |
           |---|---|---|---|
           | Schwab | all 6 | yes | yes |
           | Massive | all 6 | no (delayed) | yes |
           | recorded | the periods on disk | no | no |
         - Strategy validation answers 400 for a period the provider doesn't serve, counting VWAP bar periods too, including inside MTSI. A period outside 1/5/10/30/60/1440 is now a 400 as well.
         - Not yet read by emails or the UI.
         - Existing strategies aren't re-checked when the provider changes, and back tests and live starts don't check periods.
       - **Jest:** `testPathIgnorePatterns` skips `<rootDir>/.claude/`, so `npm test` in the main checkout no longer runs agent worktrees' copies of the tests.
   - **Open: found in the agent review, not fixed yet.**
     - [x] **Runs that are in the database but not running.** Done: see "Runs reload after a restart" under Progress. Original note: After a restart, or when a start fails during warm-up, `live_job` rows stay `active` or `paused` with no in-memory job (nothing reloads them; see `start.ts`). They still appear in the current-runs list. Resume replies 200 and sets the DB to `active`, but nothing runs, and `/vars` returns 404 (`run-service.ts` `transition`, `LiveJobRunner.pause/resume/endStrategy` are silent no-ops for unknown ids). Fix: reload runs at startup, mark rows `ended` when a start fails after the insert, and have resume or pause error out if the job isn't in memory.
     - [x] **Paused jobs get dropped.** Done: `isInitialized()` counts paused jobs. Original note: `LiveMasterJob.isInitialized()` is `jobs.length > 0` and ignores `pausedJobs`. So if every run is paused when a new run starts, `LiveJobRunner.runJobs` builds a new master job and the paused ones are lost. A later resume reports success and runs nothing.
     - [x] **Transactions are readable across users.** Done: see "Transactions: done" under Progress.
     - [x] **Analysis back tests accept another user's group.** Done: see "Analyses: done" under Progress.
     - [x] **Deleting a strategy or group that has run history shows only "Internal server error."** Done: see "Deleting with run history" under Progress. Original note: The `live_job` and `backtest_result` foreign keys don't cascade, so the delete fails with a MySQL FK error. Fix: check for history first and return a 409/400 that says why, or decide whether to keep or delete the history.
     - [x] **Background work still running when an integration test ends writes to the real database.** Done: see "Background work after an integration test" under Progress. Original note: Once the test's transaction is rolled back, a query from a timer or job still in flight (for example in `LiveJobRunner`) goes to the pool and commits, and one sent after `closeConnection` opens a new pool. The single connection behaved the same way. Fix: have each suite stop its background work and wait for it before the rollback, or have `DatabaseAPI` refuse queries after the test's close.
     - [x] **Back tests waiting for a worker have no time limit.** Done: see "Back-test queue" under Progress. Original note: The timeout starts when a worker takes the task, a client that disconnects doesn't cancel it, and a self-hosted copy has no per-user limit, so a burst of requests can build a long queue. The hosted profile's limit of 2 per user bounds it there. Fix when needed: a cap on the queue length, or a deadline for waiting.
     - [x] **Any logged-in user can change or delete position rules.** Gone from the public app with the trade routes (step 8). Original note: The `positions` table (stop-loss and target rules for the Schwab trading account) has no owner column, and `/api/trade/position-rule` (`trade-router.ts` `updatePositionRule`, `deletePositionRule`, and the rule list in `getAccountPositions`) doesn't check who is calling. Harmless while there is one user. **The private app still has this**, if it ever has more than one user.
7. **Turn strategies into signal strategies (Phase 4).** Add paper positions and exit alerts, and remove real-money trading from the core.
   - **Real-money trading isolated, then removed: done.** Step 7 first moved it into `src/trading` behind core hooks (`registerRunType`, `registerApiRoutes`, `installTrading()`). Step 8 then deleted that folder and the hooks, since the two apps don't share code (§4). What was removed is listed under step 8.
   - **Paper positions: done.** `paper_position` (changeset `paper-position`, applied by hand to `new_schema` and `stock_app_loadtest`) holds each live run's open positions: symbol, side, entry price and time, quantity, and the id of the screener that entered it (`screener_key`; see the strategy format under step 8).
     - A simulation writes a row when it enters and deletes it when it exits, one write after another per run so an exit never overtakes its entry. Writes never reject; a failure is logged. Closed trades still go to `transaction_sim`.
     - After a restart, `RunService.restoreRuns` gives each reloaded run its positions back. It also takes back the buying power they use and the bars since entry (trading days for DAY). So the run exits them on its own signals, and `percentGain`/`timeSinceEntry` keep working.
     - Each position finds its screener by id, not by its place in the list, so reordering screeners doesn't hand it another screener's exit rules. An edited screener keeps its id, so its open positions follow the edited exit rules. If the screener was removed, the position closes at the next bar. (This first used a fingerprint of the screener's definition; ids replaced it with the strategy format.)
     - An intraday position from an earlier session closes at the next bar. That happens when the server was down or the run paused at that session's close, including a restart after the close on the same day. The check runs on every bar, not only at restore.
     - Ending a run from the API stops it in memory first, waits for its queued position writes, then deletes its positions, so no write lands after the delete. Ending runs at restart or after a failed start deletes them too. A failed delete is logged and doesn't fail the end.
     - No foreign keys: a run with positions has a `live_job` row, which already blocks deleting its strategy or group (Lane B's 409).
     - Checked against MySQL: the repository, and a restart test where a reloaded run holds its position and an ended run's is gone.
   - **Exit alerts: done.** A run started with alerts on (`notify=true`, stored as `live_job.notify_on_entry`) now also sends one when it exits a position. The alert gives the side, the gain in percent, and the reason: an exit signal, or the end of the session.
     - Entry and exit text is built in [src/notify/signal-alerts.ts](src/notify/signal-alerts.ts).
     - Prices are left out when the data provider's `capabilities.displayPrices` is false.
     - Exit alerts use the outbox kind `exit` and the dedup key `exit:{run}:{symbol}:{time}`.
   - **Throttling and digests: done** (in the outbox, PRODUCTION-READINESS.md §2.4).
     - After an entry or exit alert goes to a user on a channel, later ones for that user and channel wait until `ALERT_DIGEST_MS` has passed since it: 5 minutes self-hosted, 15 hosted, 0 for no wait. They then go out together as one message ("N strategy alerts", one line each, oldest first).
       - A digest takes every due alert for that user and channel, up to 500, not just those in the sender's batch of 20.
       - A text digest stays within Twilio's 1600 characters, ending "…and N more" when it can't list them all.
       - The "last alert sent" lookup has its own index (changeset `alert-outbox-signal-index`).
     - System alerts (scheduler, Schwab sign-in) never wait.
     - Each alert in a digest keeps its own row, attempts and status, so a failed digest is retried per alert.
     - Checked end to end with a fake Mailgun and an 8 s wait: the first entry and a system alert went at once; an exit and an entry raised during the wait went together at 10 s (the wait plus up to one 5 s poll).
   - **Agent review fixes.** These changes came out of the review, each with tests:
     - an intraday position restored after the close on its own date was held overnight;
     - a failed position delete left an ended run trading in memory;
     - a position written while a run was ending was orphaned;
     - a burst of alerts took one digest wait per 20 alerts;
     - a database error during a full batch made the sender loop with no pause;
     - a screener edit or reorder handed a restored position the wrong exit rules;
     - two signals for one symbol in one bar entered it twice (buying power counted twice, two entry alerts).
     
     The last fix is in `StrategyRun`, shared with back tests: one entry per symbol per bar, holding the last signal as before. The back-test integration fixtures don't change. Trading routes were also registered before the server listened; those routes are gone since step 8.
   - **Not done in step 7:**
     - Renaming `StrategySimulation` and the "simulation" routes and columns to signal strategies. Left for the frontend rename (step 9), so the API and UI change together.
     - An API or MCP tool listing a run's open positions.
     - Per-run limits on how many positions alert.
     - The settings page doesn't show `ALERT_DIGEST_MS` yet.
     - A position in a symbol later removed from the run's group isn't closed. Its run never gets a bar for it.
   - **Found on the way: daily candles from Schwab.** Schwab stamps past daily candles at midnight Central but the current day's at midnight Eastern, and the step 4 normalizer rejected that. Once a day's candle existed, warm-up failed, so DAY runs couldn't start or reload until the next morning. Fixed in `dailyCandleTime`.
8. **Split into two apps** (see §4). Choose the license first, then publish the reviewed public code as a **new repository with a fresh first commit**. This repo's history isn't rewritten.
   - **Trading removed from the public app: done** (uncommitted).
     - **Backend:** `src/trading` (`RealMoneyStrategy`, the Schwab account and order API `SchwabAPI`, the `/api/trade` routes, position rules, the risk monitor and its job) and its tests; the `real` run routes (`/real-strategy`, `/current-strategies`, pause, resume and end); `GET /api/transaction/real`; the MCP tools' `type` input; `StrategyType.REAL`, `AccountType` and `IPositionRule`.
     - **Frontend:** the trading page, the charts page, and the real-strategy section of Run strategies, with their API calls and types.
     - **Dependencies:** `schwab-client-js` with `util/schwab-streaming-api.ts`, and `chart.js`.
     - **Kept:** Schwab sign-in and market data (`SchwabAuth`, `SchwabClient`). Also kept, for databases made by older versions: the `positions` and `transaction_real` tables, the `real` job type, and the restart step that ends leftover `real` runs. Before the fresh repo, decide whether a new install should still create `positions` and `transaction_real`.
     - **Private app: set up** in its own repo, `stock-app-trading` (local only so far, not committed). It has the Schwab account and orders, position rules and the risk monitor, `/api/trade`, the trading dashboard, the charts page, and watchlists in place of stock groups. It's TypeScript with its own Schwab client and SQLite, runs on localhost only, and imports nothing from this repo. Its README lists what changed on the way, including fixes to the risk monitor.
   - **License: MIT** (`LICENSE`, both `package.json`s), confirmed November 2026.
   - **Left:** decide whether a new install still creates the `positions` and `transaction_real` tables, review the public snapshot, and publish it as the new repository.
   - **Before the split (agreed November 2026):** clean up dependencies, version the strategy format (a schema plus stable screener ids), and move tests from Jest to Vitest, so both repos start clean.
   - **Dependency cleanup: done.**
     - **Backend, removed (unused):** the four Babel packages (no config used them), `moment-timezone`, `node-schedule` and its types, `@polygon.io/client-js`, `@jest-mock/express`, the TD Ameritrade streamer, `@types/express-session` and `@types/body-parser`.
       - `app-server.ts` imported `body-parser` without declaring it; it now uses Express 5's own `express.json()` and `express.urlencoded()`. A malformed JSON body still gets a 400.
       - `technicalindicators` is test-only, so it moved to dev dependencies.
     - **Frontend, removed (unused):** Babel (`.babelrc`, three presets and `babel-loader`; webpack builds with `ts-loader` and Jest uses `ts-jest`), `eslint-webpack-plugin`, `@types/react-router-dom` (v5 types; React Router 7 ships its own) and `@types/prop-types`.
       - The two `propTypes` blocks were removed. React 19 ignores them on function components, and TypeScript already types those props.
       - `@types/node` moved to dev dependencies.
     - **Updates:** everything else updated within its version range, in both packages.
     - **Majors:** dotenv 18 and `@types/node` 26 (both packages) are done. Left for later: TypeScript 7 (the new native compiler; `ts-jest` and `ts-loader` don't support it yet), and PrimeReact and PrimeIcons 11/8 (frontend; better done with the step 9 UI work).
     - **Removed in step 8:** `schwab-client-js` with `util/schwab-streaming-api.ts`, the Schwab streaming experiment that uses it.
   - **Strategy format: done.** Screeners stay JSON in `strategy.screeners`; reusable screeners across strategies aren't wanted, so there's no `screener` table. The format is now versioned and checked ([src/services/strategy-schema.ts](src/services/strategy-schema.ts)).
     - **Version 2:** every screener has an `id`, unique within its strategy and kept across edits. `strategy.screeners_version` records the format (changeset `strategy-screeners-version`, default 1; applied by hand to `new_schema` and `stock_app_loadtest`). Old code that doesn't know the column keeps working.
     - **Reading:** `StrategyMapper` gives screeners without an id `s1`, `s2`... by position: the same on every read, and stored on the next save. All 58 strategies in `new_schema` were version 1.
     - **Saving:** `validateStrategyInput` now runs, in order:
       1. a zod schema for the shape. Operators `= != > >= < <=`. AND/OR connectors: at least one fewer than the filters, and at most 50. The form can leave extras behind when a filter is removed; they're ignored. A numeric `compareVal` unless `compareVar` is set. Name and description within their column sizes. A known period. 1–20 screeners.
       2. the engine's own filter parser, plus the percentile filter's session cap. A filter the engine can't run (an unsupported variable like `adx`, a missing param) is now a 400 at save, not an error when a run loads it. The older per-variable checks (`validateFilter`) aren't used here any more: their variable list is out of date, and the schema and parser catch everything they did. The analysis page still uses them.
       3. screener ids: kept when sent back, and a 400 for duplicates. A screener sent without an id takes the id of an identical stored screener (`carryOverIds`), so an old browser tab doesn't detach its open positions; otherwise it gets a new `scr_…` id. On read, a duplicated stored id stays on the first screener and the rest are renamed (`upgradeScreeners`).
       4. the provider's periods.
       
       Errors name the place, e.g. `screeners[0].buySellFilters.enter.filters[1].operator: operator must be one of …`. Every stored strategy in `new_schema` passes.
     - **Paper positions** store the screener id in `screener_key` (now `VARCHAR(64)`).
     - **Frontend:** saving a screener in the form keeps its id (`ScreenerUtil.toSaved`, with a test). New screeners already got a `temp_…` id from the form, and the server keeps it.
     - **Checked:** backend unit suites, the frontend tests and build, and the strategy, auth, restore, paper-position, delete-with-history, warm-up and back-test integration suites. A new `strategy-format.integration.test.ts` covers ids on create and edit, and reading and re-saving a version-1 row.
     - **Checked:**
       - backend: type-check, lint, all unit suites, the UTC run, a production build, and an HTTP integration suite;
       - frontend: tests, lint, type-check and a production build, matching the baseline taken before the change. Webpack's newer minor version adds one performance tip.
   - **Consider moving tests from Jest to Vitest here.** Not worth it before: the unit suite takes about 23 s, and 48 test files use `jest.mock` automocks, whose hoisting and automock behavior differ slightly in Vitest. The fresh repo is the cheap moment. Until then, note that `jest` 30 runs with `ts-jest` 29, which officially supports Jest 29.
9. **Clean up the frontend.** Add a settings page for the data source, email and Schwab sign-in status. Fix the filter dropdowns and their missing period inputs. Rename simulations to strategies and alerts.
   - **Filter dropdowns: done (Lane C).**
     - **Removed:** `adx`, `volumechange` and `marketcap`, plus inputs the engine ignores (the MACD crossover level, divergence before/after).
     - **Added:** period inputs for VWAP (bar period) and volume SMA, plus Bollinger multiplier and band. Volume, MACD line and MACD signal line are new options.
     - **Fixed fields the engine never read:** TSI wrote `mPeriod`/`nPeriod` instead of `emaPeriod1`/`emaPeriod2`, MACD signal had no inputs at all, and compare variables wrote their own params, which the engine never reads (both sides share every param except `timeAgo`).
     - **The one list:** `filter-group/filter-variables.ts` is the frontend's only list of options and required params. `src/tests/engine/frontend-filter-variables.test.ts` runs every option through `filterVariables`.
   - **Settings page: done, read only (Lane C).** It shows the data provider, the Schwab sign-in status and flow (using the existing `/api/schwab/*` endpoints), the alert channels the outbox will use (set up or not, from `configuredNotifiers`) and the back-test settings.
     - Served by `GET /api/settings` (`SettingsService`). It returns no keys, addresses or phone numbers.
     - Nothing is written back. Provider capabilities aren't shown yet.
   - **Still to do:** rename simulations to strategies and alerts, after step 7.
10. **Package it.** Write a Docker Compose file, a setup guide, and optionally a one-click template for a cloud host.
11. **Add the MCP server.** Start with read-only tools, then strategy creation with the indicator list as a resource, then background back tests, then the start, pause and end controls.
   - **Read-only tools and background back tests: done (Lane C).**
     - **How it runs:** on stdio as its own process (`npm run --silent mcp`, or `node build/mcp/main.js`). Stdout carries only protocol messages. It uses `@modelcontextprotocol/sdk` 1.32.2 and `zod` 4.6.7.
     - **Who it acts as:** the user set by `MCP_USER_ID` or `MCP_USERNAME`, or the install's only user. It refuses to start when that's ambiguous.
     - **Read tools:** list groups, strategies, runs, back-test results and transactions, through the services, not the routes.
     - **Variable catalog:** `stock-app://variables`, also offered as the `describe_variables` tool, built from `src/engine/variable-catalog.ts` and tested against the engine.
     - **Back tests:** `start_back_test`, `get_back_test` and `list_back_test_jobs`.
       - `RunService.backTest` is split into `prepareBackTest` (checks and ownership, rejected at once) and the run, which goes through the process's own `BackTestPool`.
       - Results are saved like a REST back test.
       - The job registry is in memory: it's lost on exit, and finished jobs are kept for an hour, up to 20 per user.
     - **Limits:** the MCP process has its own pool, so `BACKTEST_MAX_PER_USER` is counted per process. It can't see the web server's memory: whether a run is loaded, and run vars.
     - **Next:** strategy creation, and the start, pause and end controls. Those controls need the Streamable HTTP transport mounted in the web server, where live runs live, and wait for step 7.
12. **Later: the hosted daily version.** Add an end-of-day data provider that declares daily-only capabilities, open sign-up and a shared email provider, all switched on by the hosted profile's defaults (see "Two deployment profiles" above).

Steps 3 and 6 are the big ones. Steps 4, 7 and 9 can overlap with them. Steps 1 and 5 are small but easy to regret skipping: step 1 keeps personal trading running, and step 5 gives numbers that can't be recreated after the fixes.

## Verification
- `npm test`. The new golden tests should fail before each fix and pass after it.
- Re-run an existing back test fixture (`src/tests/back-test`, `expected-test-results`). Expected results *will* change for any strategy using RSI or MACD crossovers, divergences, Bollinger Bands or percentile. Review those diffs as intended changes.
- For the live path: feed a recorded sequence of quote snapshots (cumulative volume) through `LiveMasterJob.handleNewData` and compare VWAP and volume against the same day's candles run through the backtest path.
