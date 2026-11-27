// Summarize the difference between two sets of back-test results.
//
//   node util/compare-backtest-results.mjs <before> <after> [--all]
//
// <before> and <after> are result files (back-test-*-results.json or
// analysis.json) or folders of them; folders are compared file by file.
// Trades are matched by symbol and entry time, analysis rows by symbol and
// time. Lists are cut at 20 lines unless --all is given.
import fs from "fs";
import path from "path";

const args = process.argv.slice(2);
const showAll = args.includes("--all");
const [before, after] = args.filter((a) => a !== "--all");
if (!before || !after) {
  console.error("usage: compare-backtest-results.mjs <before> <after> [--all]");
  process.exit(2);
}

const load = (file) => {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  return typeof data === "string" ? JSON.parse(data) : data;
};
const limit = (lines) =>
  showAll || lines.length <= 20 ? lines : [...lines.slice(0, 20), `... ${lines.length - 20} more`];
const pct = (n) => (n === undefined ? "?" : `${n > 0 ? "+" : ""}${Number(n).toFixed(2)}%`);
const day = (t) => new Date(t).toISOString().slice(0, 16).replace("T", " ") + "Z";

const isBackTest = (data) => Array.isArray(data) && data.every((r) => r && Array.isArray(r.gains));

function compareBackTests(a, b) {
  const byName = (rows) => new Map(rows.map((r) => [r.name, r]));
  const [ra, rb] = [byName(a), byName(b)];
  for (const name of new Set([...ra.keys(), ...rb.keys()])) {
    const sa = ra.get(name);
    const sb = rb.get(name);
    console.log(`\n  strategy ${name}`);
    if (!sa || !sb) {
      console.log(`    only in ${sa ? "before" : "after"}`);
      continue;
    }
    const key = (g) => `${g.symbol}@${g.enteredTime}`;
    const ga = new Map(sa.gains.map((g) => [key(g), g]));
    const gb = new Map(sb.gains.map((g) => [key(g), g]));
    const removed = [...ga.keys()].filter((k) => !gb.has(k)).map((k) => ga.get(k));
    const added = [...gb.keys()].filter((k) => !ga.has(k)).map((k) => gb.get(k));
    const changed = [...ga.keys()]
      .filter((k) => gb.has(k))
      .map((k) => [ga.get(k), gb.get(k)])
      .filter(([x, y]) => x.timeFormatted !== y.timeFormatted || x.gainPercent !== y.gainPercent || x.atClose !== y.atClose);
    const sum = (gs) => gs.reduce((s, g) => s + Number(g.gainPercent || 0), 0);

    console.log(
      `    trades ${sa.tradeNum} -> ${sb.tradeNum}, total ${Number(sa.total).toFixed(4)} -> ${Number(sb.total).toFixed(4)}, ` +
        `avg ${Number(sa.avgTrade).toFixed(5)} -> ${Number(sb.avgTrade).toFixed(5)}`,
    );
    console.log(
      `    same ${ga.size - removed.length - changed.length}, changed ${changed.length}, ` +
        `removed ${removed.length} (sum ${pct(sum(removed))}), added ${added.length} (sum ${pct(sum(added))})`,
    );
    const line = (g) => `${g.symbol.padEnd(6)} in ${g.enteredTimeFormatted.padEnd(22)} out ${g.timeFormatted.padEnd(22)} ${pct(g.gainPercent)}`;
    if (removed.length) console.log("    removed:\n" + limit(removed.map((g) => "      - " + line(g))).join("\n"));
    if (added.length) console.log("    added:\n" + limit(added.map((g) => "      + " + line(g))).join("\n"));
    if (changed.length)
      console.log(
        "    changed exit:\n" +
          limit(changed.map(([x, y]) => `      ~ ${x.symbol.padEnd(6)} in ${x.enteredTimeFormatted.padEnd(22)} out ${x.timeFormatted} ${pct(x.gainPercent)} -> ${y.timeFormatted} ${pct(y.gainPercent)}`)).join("\n"),
      );
  }
}

function compareRows(a, b) {
  const key = (r) => `${r.symbol}@${r.time}`;
  const ma = new Map(a.map((r) => [key(r), r]));
  const mb = new Map(b.map((r) => [key(r), r]));
  const removed = [...ma.keys()].filter((k) => !mb.has(k));
  const added = [...mb.keys()].filter((k) => !ma.has(k));
  const changed = [...ma.keys()]
    .filter((k) => mb.has(k))
    .map((k) => {
      const [x, y] = [ma.get(k), mb.get(k)];
      const diffs = [...new Set([...Object.keys(x), ...Object.keys(y)])]
        .filter((f) => JSON.stringify(x[f]) !== JSON.stringify(y[f]))
        .map((f) => `${f} ${JSON.stringify(x[f])} -> ${JSON.stringify(y[f])}`);
      return diffs.length ? `      ~ ${x.symbol.padEnd(6)} ${day(x.time)}  ${diffs.join(", ")}` : null;
    })
    .filter(Boolean);
  const fmt = (k, m, sign) => `      ${sign} ${m.get(k).symbol.padEnd(6)} ${day(m.get(k).time)}`;
  console.log(`\n  rows ${a.length} -> ${b.length}: same ${ma.size - removed.length - changed.length}, changed ${changed.length}, removed ${removed.length}, added ${added.length}`);
  if (removed.length) console.log("    removed:\n" + limit(removed.map((k) => fmt(k, ma, "-"))).join("\n"));
  if (added.length) console.log("    added:\n" + limit(added.map((k) => fmt(k, mb, "+"))).join("\n"));
  if (changed.length) console.log("    changed:\n" + limit(changed).join("\n"));
}

function compareFile(fa, fb) {
  console.log(`\n=== ${path.basename(fb)}`);
  const [a, b] = [load(fa), load(fb)];
  if (isBackTest(a) && isBackTest(b)) compareBackTests(a, b);
  else if (Array.isArray(a) && Array.isArray(b)) compareRows(a, b);
  else console.log(JSON.stringify(a) === JSON.stringify(b) ? "  identical" : "  differs (unrecognized shape)");
}

if (fs.statSync(before).isDirectory()) {
  const names = new Set([...fs.readdirSync(before), ...fs.readdirSync(after)].filter((n) => n.endsWith(".json")));
  for (const name of [...names].sort()) {
    const [fa, fb] = [path.join(before, name), path.join(after, name)];
    if (!fs.existsSync(fa) || !fs.existsSync(fb)) console.log(`\n=== ${name}: only in ${fs.existsSync(fa) ? "before" : "after"}`);
    else compareFile(fa, fb);
  }
} else {
  compareFile(before, after);
}
