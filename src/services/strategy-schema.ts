import { randomUUID } from "crypto";
import { z } from "zod";
import Error400 from "../errors/error-400";
import { CONSTANTS, PeriodType } from "../shared/constants";
import { IScreener } from "../types/strategy-types";

/**
 * The format of a strategy's screeners, stored in `strategy.screeners_version`.
 * - 1: no screener ids.
 * - 2: every screener has an `id`, unique within its strategy and kept across edits, so open
 *   paper positions can find the screener that entered them.
 *
 * Bump it when the format changes, and teach `upgradeScreeners` to convert the older one.
 */
export const SCREENERS_VERSION = 2;

const OPERATORS = ["=", "!=", ">", ">=", "<", "<="] as const;
const CONNECTORS = ["AND", "OR"] as const;
/** Ids are short and safe to show and log: letters, digits, `_` and `-`. */
const SCREENER_ID = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_SCREENERS = 20;
const MAX_FILTERS = 50;

const isNumber = (value: string) => value.trim() !== "" && Number.isFinite(Number(value));
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * One comparison: a variable, an operator, and a number or another variable. Indicator params
 * (`timeAgo`, `fastPeriod`, `bullish`...) vary by variable; their shape is checked here and their
 * meaning by the engine's own parser (filter-specs.ts) in strategy-validation.ts.
 */
const filterSchema = z
  .object({
    varName: z.string().min(1, { error: "varName is required" }),
    operator: z.enum(OPERATORS, { error: `operator must be one of ${OPERATORS.join(" ")}` }),
    compareVal: z.string({
      error: (issue) => (issue.input === undefined ? "compareVal is required (empty when compareVar is set)" : "compareVal must be a string"),
    }),
    compareVar: z.string().optional(),
    compareVarCoefficient: z.string().optional(),
  })
  .catchall(z.union([z.string(), z.number(), z.boolean(), z.null()]))
  .superRefine((filter, ctx) => {
    if (!filter.compareVar && !isNumber(filter.compareVal)) {
      ctx.addIssue({ code: "custom", path: ["compareVal"], message: "compareVal must be a number unless compareVar is set" });
    }
    if (filter.compareVarCoefficient !== undefined && filter.compareVarCoefficient !== "" && !isNumber(filter.compareVarCoefficient)) {
      ctx.addIssue({ code: "custom", path: ["compareVarCoefficient"], message: "compareVarCoefficient must be a number" });
    }
  });

/**
 * Filters joined in order: connector `i - 1` joins filter `i` to the ones before it. The form keeps
 * one connector per filter row, and can leave one behind when a filter is removed, so a group may
 * have more connectors than it needs; FilterGroup.run reads only the first `filters - 1`.
 */
const groupSchema = z
  .object({
    filters: z.array(filterSchema, { error: "filters must be a list" }).max(MAX_FILTERS, { error: `at most ${MAX_FILTERS} filters` }),
    connectors: z
      .array(z.enum(CONNECTORS, { error: "every connector must be AND or OR" }), {
        error: "connectors must be a list",
      })
      .max(MAX_FILTERS, { error: `at most ${MAX_FILTERS} connectors` }),
    flags: z.array(z.string()).optional(),
  })
  .superRefine((group, ctx) => {
    const needed = Math.max(0, group.filters.length - 1);
    const count = group.connectors.length;
    if (count < needed) {
      ctx.addIssue({
        code: "custom",
        path: ["connectors"],
        message: `${plural(group.filters.length, "filter")} need ${plural(needed, "connector")} (AND or OR between each pair), got ${count}`,
      });
    }
  });

const pairSchema = z.object({ enter: groupSchema, exit: groupSchema });

const screenerSchema = z
  .object({
    /** Absent on a new screener; the server assigns one. */
    id: z.string().regex(SCREENER_ID, { error: "a screener id is 1-64 letters, digits, _ or -" }).optional(),
    buySellFilters: pairSchema.optional(),
    shortCoverFilters: pairSchema.optional(),
    flags: z.array(z.unknown()).optional(),
  })
  .refine((s) => s.buySellFilters || s.shortCoverFilters, { error: "a screener needs buySellFilters or shortCoverFilters" });

/** What a client sends to create or change a strategy. Other fields (an `id`, say) are dropped. */
export const strategyInputSchema = z.object({
  name: z.string({ error: "name is required" }).trim().min(1, { error: "name is required" }).max(50, { error: "name is at most 50 characters" }),
  description: z.string({ error: "description is required (it may be empty)" }).max(200, { error: "description is at most 200 characters" }),
  period: z
    .number({ error: "period must be a number of minutes" })
    .refine((p) => CONSTANTS.PERIODS.includes(p as PeriodType), {
      error: `period must be one of ${CONSTANTS.PERIODS.join(", ")} (minutes)`,
    }),
  screeners: z
    .array(screenerSchema, { error: "screeners must be a list" })
    .min(1, { error: "a strategy needs at least one screener" })
    .max(MAX_SCREENERS, { error: `at most ${MAX_SCREENERS} screeners` }),
});

/** `screeners[0].buySellFilters.enter.filters[1].operator`, for error messages. */
export const pathLabel = (path: PropertyKey[]) =>
  path.reduce<string>((out, key) => (typeof key === "number" ? `${out}[${key}]` : out ? `${out}.${String(key)}` : String(key)), "");

/** Parses `payload` against the schema; throws Error400 naming the first problem and where it is. */
export function parseStrategyInput(payload: unknown) {
  const result = strategyInputSchema.safeParse(payload);
  if (!result.success) {
    const [issue] = result.error.issues;
    const where = pathLabel(issue.path);
    throw new Error400(where ? `${where}: ${issue.message}` : issue.message);
  }
  return result.data;
}

/**
 * Gives each new screener (no `id`) a fresh one; keeps the ids of screeners the client sent back.
 * Throws Error400 if two screeners share an id.
 */
export function assignScreenerIds<T extends { id?: string }>(screeners: T[]): (T & { id: string })[] {
  const seen = new Set<string>();
  for (const s of screeners) {
    if (!s.id) continue;
    if (seen.has(s.id)) throw new Error400(`two screeners have the id "${s.id}"`);
    seen.add(s.id);
  }
  return screeners.map((s) => ({ ...s, id: s.id || `scr_${randomUUID().replace(/-/g, "").slice(0, 12)}` }));
}

/** JSON with object keys sorted, so equal definitions give equal text however they were stored. */
const canonical = (value: unknown): string =>
  Array.isArray(value)
    ? `[${value.map(canonical).join(",")}]`
    : value && typeof value === "object"
      ? `{${Object.keys(value)
          .sort()
          .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
          .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
          .join(",")}}`
      : (JSON.stringify(value) ?? "null");

/** A screener's definition without its id, for matching. */
const definition = (screener: { id?: string }) => canonical({ ...screener, id: undefined });

/**
 * For an update: a screener sent without an id (a client that doesn't echo ids, an old browser
 * tab) takes the id of an identical screener in the stored strategy, if no other screener uses
 * it, so an unchanged screener keeps its open positions.
 */
export function carryOverIds<T extends { id?: string }>(screeners: T[], stored: { id?: string }[]): T[] {
  const used = new Set(screeners.map((s) => s.id).filter(Boolean));
  const available = stored.filter((s) => s.id && !used.has(s.id));
  return screeners.map((s) => {
    if (s.id) return s;
    const match = available.findIndex((old) => definition(old) === definition(s));
    if (match < 0) return s;
    const [old] = available.splice(match, 1);
    return { ...s, id: old.id };
  });
}

/**
 * Stored screeners in the current format. Version 1 (and any screener saved without an id, e.g.
 * by older code) gets `s1`, `s2`... by position: the same every time it's read, until the next
 * save stores them. A duplicated stored id is kept on its first screener and renamed on the
 * rest, so every screener can be told apart. Anything that isn't a list of screeners is read as
 * no screeners, not an error.
 */
export function upgradeScreeners(screeners: unknown): IScreener[] {
  if (!Array.isArray(screeners)) return [];
  const list = screeners.filter((s): s is IScreener => Boolean(s) && typeof s === "object");
  const taken = new Set<string>();
  const unique = (base: string) => {
    let id = base;
    for (let n = 2; taken.has(id); n++) id = `${base}_${n}`;
    taken.add(id);
    return id;
  };
  // stored ids first, so a generated one never takes an id a later screener already has
  const stored = list.map((s) => (s.id && !taken.has(s.id) ? (taken.add(s.id), s.id) : undefined));
  return list.map((s, i) => ({ ...s, id: stored[i] ?? unique(s.id ? s.id : `s${i + 1}`) }));
}
