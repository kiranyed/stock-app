import Error400 from "../errors/error-400";

/** A positive integer id from a path, query or body value, or Error400. */
export const parseId = (value: unknown, what = "id"): number => {
  const id = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isInteger(id) || id <= 0) throw new Error400(`${what} must be a number greater than 0`);
  return id;
};

/** One or more ids from a repeated query parameter (`?id=1&id=2`); empty strings are skipped. */
export const parseIds = (value: unknown, what = "id"): number[] => {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return [...new Set(values.filter((v) => v !== "").map((v) => parseId(v, what)))];
};

/** A millisecond timestamp from a query string, or Error400. */
export const parseTimestamp = (value: unknown, what: string): number => {
  if (typeof value !== "string" || !/^\d+$/.test(value)) throw new Error400(`${what} must be a number`);
  return Number(value);
};
