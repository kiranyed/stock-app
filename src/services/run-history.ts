import Error409 from "../errors/error-409";
import { IRunHistoryCount } from "../types/entity-types";

type Kind = "strategy" | "group";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const summarize = ({ name, runs, backtests }: IRunHistoryCount) => {
  const parts = [];
  if (Number(runs) > 0) parts.push(plural(Number(runs), "run"));
  if (Number(backtests) > 0) parts.push(plural(Number(backtests), "saved back-test result"));
  return `"${name}" has ${parts.join(" and ")}`;
};

const keptHistory = (kind: Kind) =>
  `Run history and back-test results are kept, so a ${kind} that has any can't be deleted. Nothing was deleted.`;

/**
 * Runs (`live_job`) and saved back-test results point at their strategy and group through
 * foreign keys that don't cascade, and that history is kept. So deleting a strategy or group
 * that has any is a 409 that says why, rather than a MySQL error (a 500).
 */
export const refuseIfHistory = (kind: Kind, counts: IRunHistoryCount[]) => {
  const withHistory = counts.filter((c) => Number(c.runs) > 0 || Number(c.backtests) > 0);
  if (!withHistory.length) return;
  throw new Error409(`Can't delete: ${withHistory.map(summarize).join("; ")}. ${keptHistory(kind)}`);
};

/** Runs the delete; history added after the check (the foreign key error) gets the same 409. */
export const deleteUnlessReferenced = async <T>(kind: Kind, remove: () => Promise<T>): Promise<T> => {
  try {
    return await remove();
  } catch (err) {
    if (/^ER_ROW_IS_REFERENCED/.test((err as { code?: string } | null)?.code ?? "")) {
      throw new Error409(`Can't delete: a ${kind} now has run history. ${keptHistory(kind)}`);
    }
    throw err;
  }
};
