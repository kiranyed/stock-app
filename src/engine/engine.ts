import { CONSTANTS, PeriodType } from "../shared/constants";
import { StockTradeUtil } from "../shared/utilities/stock-trade";
import {
  Bar,
  Bollinger,
  Crossover,
  Divergence,
  Ema,
  Indicator,
  Macd,
  MacdSignal,
  Mtsi,
  PercentChange,
  PercentChangePercentile,
  Price,
  Rsi,
  Sma,
  Source,
  TimeOfDay,
  Tsi,
  Volume,
  Vwap,
} from "./indicators";
import { IndicatorSpec, homePeriod, keyOf, validateSpec } from "./specs";

/** A bar as it arrives from a data source, before the engine stamps it. */
export type BarInput = Omit<Bar, "t" | "session">;

interface SymbolIndicators {
  /** creation order; dependencies are always created before their dependents */
  list: Indicator[];
  byId: Map<string, Indicator>;
  last: Map<PeriodType, { t: number; session: string }>;
}

const idOf = (period: PeriodType, key: string) => `${period}|${key}`;

/** Trading date (ET) of a time, used to tell sessions apart. */
export function sessionOf(t: number): string {
  const d = StockTradeUtil.getEastCoastDate(new Date(t));
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/**
 * Holds every indicator for every symbol and feeds them bars. Each unique
 * (symbol, period, key) is computed once, however many strategies read it.
 *
 * Indicators run over bars, not clock time: state carries across sessions,
 * the overnight gap is skipped, and only a bar missing inside a session is
 * reported to the indicators (via `skip`).
 */
export class IndicatorEngine {
  private readonly symbols = new Map<string, SymbolIndicators>();

  /**
   * The indicator for `spec` on `symbol`, creating it and its dependencies if
   * needed. Throws InvalidSpecError for settings that can't be computed.
   */
  add(symbol: string, spec: IndicatorSpec, strategyPeriod: PeriodType): Indicator {
    validateSpec(spec, strategyPeriod);
    let state = this.symbols.get(symbol);
    if (!state) {
      state = { list: [], byId: new Map(), last: new Map() };
      this.symbols.set(symbol, state);
    }
    return this.create(state, spec, homePeriod(spec, strategyPeriod));
  }

  private create(state: SymbolIndicators, spec: IndicatorSpec, p: PeriodType): Indicator {
    const key = keyOf(spec);
    const id = idOf(p, key);
    const existing = state.byId.get(id);
    if (existing) return existing;

    const dep = (s: IndicatorSpec) => this.create(state, s, homePeriod(s, p));
    const level = (value: number): Source => ({ value });
    let ind: Indicator;
    switch (spec.kind) {
      case "price":
        ind = new Price(key, p, {});
        break;
      case "volume":
        ind = new Volume(key, p, {});
        break;
      case "time":
        ind = new TimeOfDay(key, p, {});
        break;
      case "percentChange":
        ind = new PercentChange(key, p, spec.bars);
        break;
      case "sma":
        ind = new Sma(key, p, spec.source, spec.bars);
        break;
      case "ema":
        ind = new Ema(key, p, spec.bars);
        break;
      case "rsi":
        ind = new Rsi(key, p, spec.bars);
        break;
      case "bollinger":
        ind = new Bollinger(key, p, spec.bars, spec.multiplier, spec.band);
        break;
      case "macd":
        ind = new Macd(
          key,
          p,
          dep({ kind: "ema", bars: spec.fast }),
          dep({ kind: "ema", bars: spec.slow }),
          spec.slow,
        );
        break;
      case "macdSignal":
        ind = new MacdSignal(
          key,
          p,
          dep({ kind: "macd", fast: spec.fast, slow: spec.slow }),
          spec.slow,
          spec.signal,
        );
        break;
      case "macdCrossover": {
        const signal = dep({ kind: "macdSignal", fast: spec.fast, slow: spec.slow, signal: spec.signal });
        ind = new Crossover(
          key,
          p,
          dep({ kind: "macd", fast: spec.fast, slow: spec.slow }),
          signal,
          spec.before,
          spec.after,
          spec.bullish,
          signal.warmupBars,
        );
        break;
      }
      case "rsiCrossover": {
        const rsi = dep({ kind: "rsi", bars: spec.bars });
        ind = new Crossover(
          key,
          p,
          rsi,
          level(spec.level),
          spec.before,
          spec.after,
          spec.bullish,
          rsi.warmupBars,
        );
        break;
      }
      case "rsiDivergence": {
        const rsi = dep({ kind: "rsi", bars: spec.bars });
        ind = new Divergence(key, p, rsi, spec.lookback, spec.bullish, rsi.warmupBars);
        break;
      }
      case "macdDivergence": {
        const macd = dep({ kind: "macd", fast: spec.fast, slow: spec.slow });
        ind = new Divergence(key, p, macd, spec.lookback, spec.bullish, macd.warmupBars);
        break;
      }
      case "vwap":
        ind = new Vwap(key, p);
        break;
      case "mtsi":
        ind = new Mtsi(key, p, dep({ kind: "vwap", barPeriod: spec.vwapPeriod }), spec.m, spec.n);
        break;
      case "tsi":
        ind = new Tsi(key, p, spec.m, spec.n);
        break;
      case "percentChangePercentile":
        ind = new PercentChangePercentile(key, p, spec.bars, spec.sessions);
        break;
    }
    state.byId.set(id, ind);
    state.list.push(ind);
    return ind;
  }

  /** Every indicator, all symbols. */
  all(): Indicator[] {
    return [...this.symbols.values()].flatMap((s) => s.list);
  }

  /** Periods that have at least one indicator, ascending. */
  periods(): PeriodType[] {
    const out = new Set<PeriodType>();
    for (const s of this.symbols.values()) for (const i of s.list) out.add(i.period);
    return [...out].sort((a, b) => a - b);
  }

  /** Symbols that need bars for `period`. */
  symbolsFor(period: PeriodType): string[] {
    const out: string[] = [];
    for (const [symbol, s] of this.symbols) {
      if (s.list.some((i) => i.period === period)) out.push(symbol);
    }
    return out;
  }

  /** Bars of history needed before every indicator on `period` is valid. */
  warmupBars(period: PeriodType): number {
    let max = 0;
    for (const s of this.symbols.values()) {
      for (const i of s.list) if (i.period === period) max = Math.max(max, i.warmupBars);
    }
    return max;
  }

  get(symbol: string, period: PeriodType, key: string): Indicator | undefined {
    return this.symbols.get(symbol)?.byId.get(idOf(period, key));
  }

  /**
   * Copy state into indicators that exist here and in `warmed` (same symbol,
   * period and key). Only `only` are touched when given, so indicators already
   * running live keep their own state.
   */
  copyStateFrom(warmed: IndicatorEngine, only?: Set<Indicator>) {
    for (const [symbol, state] of this.symbols) {
      for (const ind of state.list) {
        if (only && !only.has(ind)) continue;
        const src = warmed.get(symbol, ind.period, ind.key);
        if (src) ind.copyStateFrom(src);
      }
      const warmedState = warmed.symbols.get(symbol);
      if (warmedState) {
        for (const [period, last] of warmedState.last) {
          if (!state.last.has(period)) state.last.set(period, { ...last });
        }
      }
    }
  }

  /**
   * Feed the bars that closed at time `t`, for any periods. Within a symbol,
   * indicators update in creation order, so a 30-minute indicator reading a
   * 5-minute VWAP sees the 5-minute bar handed over at the same time.
   */
  onBars(t: number, bars: Partial<Record<PeriodType, BarInput[]>>) {
    const session = sessionOf(t);
    const bySymbol = new Map<string, Map<PeriodType, Bar>>();
    for (const [p, list] of Object.entries(bars)) {
      const period = Number(p) as PeriodType;
      for (const b of list ?? []) {
        let m = bySymbol.get(b.symbol);
        if (!m) bySymbol.set(b.symbol, (m = new Map()));
        m.set(period, { ...b, t, session });
      }
    }

    for (const [symbol, periodBars] of bySymbol) {
      const state = this.symbols.get(symbol);
      if (!state) continue;

      for (const [period] of periodBars) {
        const last = state.last.get(period);
        if (last && t <= last.t) {
          periodBars.delete(period); // already fed this bar
          continue;
        }
        if (last && period < PeriodType.DAY && last.session === session) {
          const missing =
            Math.round((t - last.t) / (period * CONSTANTS.MILLIS_IN_MINUTE)) - 1;
          for (let k = 0; k < missing; k++) {
            for (const ind of state.list) if (ind.period === period) ind.skip();
          }
        }
        state.last.set(period, { t, session });
      }

      for (const ind of state.list) {
        const bar = periodBars.get(ind.period);
        if (bar) ind.update(bar);
      }
    }
  }
}
