/**
 * npm run load-test -- [--profile small|medium] [--levels 1,2,5,10]
 *                      [--duration 60] [--mix mixed|backtest] [--label baseline]
 *                      [--base http://localhost:3101]
 *
 * Simulates users of a running load-test server (npm run load-test:server):
 * each signs up, creates a stock group and a strategy, then loops over a mix
 * of actions with about a second of think time between them. A separate
 * probe asks for a cheap page every 250 ms, to show how long the server
 * stops answering while back tests run. Results go to util/load-test/results.
 */
import fs from "fs";
import path from "path";
import axios, { AxiosRequestConfig } from "axios";
import { DEFAULT_PORT, IProfile, PROFILES, RESULTS_DIR } from "./common";

// ---------- options ----------

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const BASE = arg("base", `http://localhost:${DEFAULT_PORT}`);
const profile: IProfile = PROFILES[arg("profile", "small")];
if (!profile) throw new Error(`Unknown profile. Expected one of: ${Object.keys(PROFILES).join(", ")}`);
const LEVELS = arg("levels", "1,2,5,10").split(",").map(Number);
const DURATION_MS = Number(arg("duration", "60")) * 1000;
const MIX = arg("mix", "mixed");
const LABEL = arg("label", "run");
const THINK_MS = Number(arg("think", "1000"));
const PROBE_MS = 250;
const REQUEST_TIMEOUT_MS = 10 * 60 * 1000;

/** How often each user picks each action. */
const MIXES: Record<string, Record<string, number>> = {
  mixed: { backTest: 1, listStrategies: 2, listGroups: 1, createDeleteStrategy: 1 },
  backtest: { backTest: 1 },
};
if (!MIXES[MIX]) throw new Error(`Unknown mix. Expected one of: ${Object.keys(MIXES).join(", ")}`);

// ---------- recording ----------

interface ISample {
  endpoint: string;
  ms: number;
  status: number; // 0: no response
  ok: boolean;
  note?: string;
}

let samples: ISample[] = [];

const RUN_ID = Date.now().toString(36);

const call = async (
  endpoint: string,
  config: AxiosRequestConfig,
  check?: (data: unknown) => string | undefined,
) => {
  const started = performance.now();
  try {
    const res = await axios({
      baseURL: BASE,
      timeout: REQUEST_TIMEOUT_MS,
      validateStatus: () => true,
      ...config,
    });
    const ms = performance.now() - started;
    const failed = res.status >= 400 ? `HTTP ${res.status}` : check?.(res.data);
    samples.push({ endpoint, ms, status: res.status, ok: !failed, note: failed });
    return res;
  } catch (err) {
    const ms = performance.now() - started;
    const note = (err as Error).message;
    samples.push({ endpoint, ms, status: 0, ok: false, note });
    return undefined;
  }
};

// ---------- a simulated user ----------

const strategyBody = (name: string) => ({
  name,
  description: "load test",
  period: profile.period,
  screeners: [
    {
      buySellFilters: {
        enter: {
          connectors: [],
          filters: [{ varName: "percentchange", operator: ">", compareVal: "0.8", timeAgo: "2" }],
        },
        exit: {
          connectors: [],
          filters: [{ varName: "percentchange", operator: "<", compareVal: "-0.3", timeAgo: "1" }],
        },
      },
    },
  ],
});

interface IUser {
  name: string;
  headers: Record<string, string>;
  groupId?: number;
  strategyId?: number;
}

const signUp = async (i: number): Promise<IUser | undefined> => {
  const name = `lt${RUN_ID}u${i}`;
  const credentials = { username: name, password: "Passw0rd9" };
  await call("POST /user/register", { method: "post", url: "/user/register", data: credentials });
  const login = await call("POST /user/login", { method: "post", url: "/user/login", data: credentials }, (d) =>
    (d as { token?: string })?.token ? undefined : "no token",
  );
  const token = (login?.data as { token?: string })?.token;
  if (!token) return undefined;
  const user: IUser = { name, headers: { "x-access-token": token } };

  const groupName = `${name}g`;
  const group = await call(
    "POST /api/group",
    { method: "post", url: "/api/group", headers: user.headers, data: { name: groupName, symbols: profile.symbols } },
    (d) => (Number.isInteger((d as { id?: number })?.id) ? undefined : "no id"),
  );
  user.groupId = (group?.data as { id?: number })?.id;

  const strategy = await call(
    "POST /api/strategy",
    { method: "post", url: "/api/strategy", headers: user.headers, data: strategyBody(`${name}s`) },
    (d) => (Number.isInteger((d as { id?: number })?.id) ? undefined : "no id"),
  );
  user.strategyId = (strategy?.data as { id?: number })?.id;

  // The group id the server returned must be this user's group, not someone else's.
  await call("GET /api/group/all (check id)", { url: "/api/group/all", headers: user.headers }, (d) => {
    const mine = Array.isArray(d) ? (d as { id: number; name: string }[]).find((g) => g.id === user.groupId) : undefined;
    return mine?.name === groupName ? undefined : `group id ${user.groupId} isn't ${groupName}`;
  });
  return user;
};

const actions: Record<string, (u: IUser) => Promise<unknown>> = {
  backTest: (u) =>
    call("PATCH /api/run/back-test", {
      method: "patch",
      url: "/api/run/back-test",
      headers: u.headers,
      params: { strategyId: u.strategyId, groupId: u.groupId, startTime: profile.startTime, endTime: profile.endTime },
    }),
  listStrategies: (u) => call("GET /api/strategy/all", { url: "/api/strategy/all", headers: u.headers }),
  listGroups: (u) => call("GET /api/group/all", { url: "/api/group/all", headers: u.headers }),
  createDeleteStrategy: async (u) => {
    const res = await call(
      "POST /api/strategy",
      { method: "post", url: "/api/strategy", headers: u.headers, data: strategyBody(`${u.name}t${Date.now()}`) },
      (d) => (Number.isInteger((d as { id?: number })?.id) ? undefined : "no id"),
    );
    const id = (res?.data as { id?: number })?.id;
    if (id !== undefined) {
      await call("DELETE /api/strategy/:id", { method: "delete", url: `/api/strategy/${id}`, headers: u.headers });
    }
  },
};

const pick = (weights: Record<string, number>) => {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [name, w] of Object.entries(weights)) {
    if ((r -= w) < 0) return name;
  }
  return Object.keys(weights)[0];
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------- statistics ----------

const percentile = (sorted: number[], p: number) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] : NaN;

const summarize = (list: ISample[], seconds: number) => {
  const byEndpoint: Record<string, ISample[]> = {};
  for (const s of list) (byEndpoint[s.endpoint] ??= []).push(s);
  return Object.fromEntries(
    Object.entries(byEndpoint).map(([endpoint, rows]) => {
      const ms = rows.map((r) => r.ms).sort((a, b) => a - b);
      const errors: Record<string, number> = {};
      for (const r of rows) if (!r.ok) errors[r.note ?? `HTTP ${r.status}`] = (errors[r.note ?? `HTTP ${r.status}`] ?? 0) + 1;
      return [
        endpoint,
        {
          count: rows.length,
          perSecond: +(rows.length / seconds).toFixed(2),
          errors,
          p50: Math.round(percentile(ms, 50)),
          p95: Math.round(percentile(ms, 95)),
          p99: Math.round(percentile(ms, 99)),
          max: Math.round(ms[ms.length - 1]),
        },
      ];
    }),
  );
};

// ---------- run ----------

const runLevel = async (users: IUser[], probeUser: IUser) => {
  samples = [];
  const until = Date.now() + DURATION_MS;
  const started = Date.now();
  let probing = true;
  const probe = (async () => {
    while (probing) {
      const t = Date.now();
      await call("probe GET /api/strategy/names", { url: "/api/strategy/names", headers: probeUser.headers });
      await sleep(Math.max(0, PROBE_MS - (Date.now() - t)));
    }
  })();
  await Promise.all(
    users.map(async (u, i) => {
      await sleep((THINK_MS * i) / users.length); // stagger the start
      while (Date.now() < until) {
        await actions[pick(MIXES[MIX])](u);
        await sleep(THINK_MS * (0.5 + Math.random()));
      }
    }),
  );
  probing = false;
  await probe;
  const seconds = (Date.now() - started) / 1000;
  return { users: users.length, seconds: +seconds.toFixed(1), endpoints: summarize(samples, seconds) };
};

const table = (level: Awaited<ReturnType<typeof runLevel>>) => {
  const rows = Object.entries(level.endpoints)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([e, s]) => {
      const errors = Object.entries(s.errors).map(([k, v]) => `${v}× ${k}`).join(", ") || "0";
      return `| ${e} | ${s.count} | ${s.perSecond} | ${s.p50} | ${s.p95} | ${s.p99} | ${s.max} | ${errors} |`;
    });
  return [
    `#### ${level.users} user(s), ${level.seconds} s`,
    "",
    "| endpoint | requests | per s | p50 ms | p95 ms | p99 ms | max ms | errors |",
    "|---|---|---|---|---|---|---|---|",
    ...rows,
  ].join("\n");
};

const main = async () => {
  const maxUsers = Math.max(...LEVELS);
  console.log(`Load test "${LABEL}" against ${BASE}: profile ${profile.name}, mix ${MIX}, levels ${LEVELS.join(", ")}`);

  samples = [];
  const signedUp = await Promise.all(Array.from({ length: maxUsers + 1 }, (_, i) => signUp(i)));
  const setup = summarize(samples, 1);
  const users = signedUp.filter((u): u is IUser => !!u?.groupId && !!u.strategyId);
  if (users.length < maxUsers + 1) {
    console.log(JSON.stringify(setup, null, 2));
    throw new Error(`Only ${users.length} of ${maxUsers + 1} users were set up; see the errors above.`);
  }
  const [probeUser, ...workers] = users;

  const levels = [];
  for (const n of LEVELS) {
    console.log(`\n${n} user(s) for ${DURATION_MS / 1000} s…`);
    const level = await runLevel(workers.slice(0, n), probeUser);
    console.log(table(level));
    levels.push(level);
  }

  const result = {
    label: LABEL,
    at: new Date().toISOString(),
    base: BASE,
    profile: { ...profile, symbols: profile.symbols.length },
    mix: MIX,
    thinkMs: THINK_MS,
    probeMs: PROBE_MS,
    node: process.version,
    setup,
    levels,
  };
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const file = path.join(RESULTS_DIR, `${LABEL}-${profile.name}-${MIX}-${result.at.replace(/[:.]/g, "-")}`);
  fs.writeFileSync(`${file}.json`, JSON.stringify(result, null, 2));
  fs.writeFileSync(
    `${file}.md`,
    [`### ${LABEL}: ${profile.name} profile, ${MIX} mix (${result.at})`, "", ...levels.map(table)].join("\n\n") + "\n",
  );
  console.log(`\nSaved ${file}.json and .md`);
};

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
