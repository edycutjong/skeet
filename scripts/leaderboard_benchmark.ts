/**
 * Live PnL benchmark — Skeet vs the field.
 *
 * Pulls the public BID Protocol leaderboard and ranks Skeet against every other
 * candidate on both cumulative PnL and per-battle PnL (the lever that actually
 * matters under the ~100 USDC/round buy-in cap). Use this to refresh the honest
 * standing numbers in docs/SUBMISSION.md before submitting.
 *
 * Each run also logs a timestamped snapshot:
 *   - docs/benchmark_snapshots.jsonl  (append-only PnL trail; one JSON line per run)
 *   - docs/BENCHMARK_LATEST.md        (overwritten; clean table for demo screenshots)
 *
 *   npm run benchmark
 */

import { appendFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const LEADERBOARD_URL = "https://dash.creator.bid/api/leaderboard";
const DOCS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "docs");
const TRAIL_FILE = resolve(DOCS_DIR, "benchmark_snapshots.jsonl");
const LATEST_FILE = resolve(DOCS_DIR, "BENCHMARK_LATEST.md");

interface Agent {
  name: string;
  addr: string;
  team: "CUSTOM" | "HOSTED" | string;
  type: string; // strategy label (Custom, Mean Rev, Rand Churn, Momentum, DissolutionArb, ...)
  battles: number;
  wins: number;
  losses: number;
  pnl: number; // cumulative
  avg: number; // per-battle PnL
  ours: boolean;
}

const fmt = (n: number) => (n >= 0 ? "+" : "") + n.toLocaleString();
const pct = (n: number, d: number) => ((100 * n) / d).toFixed(0) + "%";
const rankOf = (sorted: Agent[], a: Agent) => sorted.indexOf(a) + 1;

function row(a: Agent, i: number, key: "pnl" | "avg", mark = "") {
  const name = (a.name || "").slice(0, 22).padEnd(22);
  const primary = key === "pnl" ? `pnl=${fmt(a.pnl).padStart(9)}` : `avg=${fmt(a.avg).padStart(6)}`;
  const secondary = key === "pnl" ? `avg=${fmt(a.avg).padStart(6)}` : `pnl=${fmt(a.pnl).padStart(9)}`;
  return `${String(i + 1).padStart(2)}. ${name} ${a.team.padEnd(6)} ${primary} ${secondary} btl=${String(a.battles).padStart(5)}${a.ours ? "   <-- SKEET" : mark}`;
}

async function main() {
  const res = await fetch(LEADERBOARD_URL);
  if (!res.ok) throw new Error(`leaderboard fetch failed: HTTP ${res.status}`);
  const data = (await res.json()) as { agents: Agent[] };
  const A = data.agents;

  const custom = A.filter((a) => a.team === "CUSTOM");
  const hosted = A.filter((a) => a.team === "HOSTED");
  const byPnl = [...A].sort((a, b) => b.pnl - a.pnl);
  const byAvg = [...A].sort((a, b) => b.avg - a.avg);
  const customByPnl = [...custom].sort((a, b) => b.pnl - a.pnl);
  const customByAvg = [...custom].sort((a, b) => b.avg - a.avg);
  const us = A.find((a) => a.ours) || A.find((a) => /skeet/i.test(a.name));

  console.log(`\n📊 BID Protocol — Live PnL Benchmark   (${new Date().toISOString()})`);
  console.log(`Field: ${A.length} agents | CUSTOM ${custom.length} · HOSTED ${hosted.length} | profitable ${A.filter((a) => a.pnl > 0).length}/${A.length} (custom ${custom.filter((a) => a.pnl > 0).length}/${custom.length})`);

  if (!us) {
    console.log("\n⚠️  Skeet not found on the leaderboard (battles paused / not yet ranked).");
  } else {
    const rP = rankOf(byPnl, us), rA = rankOf(byAvg, us);
    const rCP = rankOf(customByPnl, us), rCA = rankOf(customByAvg, us);
    console.log(`\n🎯 SKEET (${us.name})`);
    console.log(`   cumPnL ${fmt(us.pnl)} · per-battle ${fmt(us.avg)} · ${us.battles} battles · ${us.wins}W/${us.losses}L (${pct(us.wins, Math.max(1, us.battles))} win)`);
    console.log(`   overall rank:  #${rP}/${A.length} cumPnL (top ${pct(rP, A.length)}) · #${rA}/${A.length} per-battle (top ${pct(rA, A.length)})`);
    console.log(`   custom-only:   #${rCP}/${custom.length} cumPnL · #${rCA}/${custom.length} per-battle`);
    console.log(`   beats ${A.length - rP} agents on cumPnL; ${A.length - rA} on per-battle`);
  }

  const topHosted = [...hosted].sort((a, b) => b.pnl - a.pnl)[0];
  console.log(`\n🏠 THE HOUSE (top hosted): ${topHosted.name} [${topHosted.type}] — cumPnL ${fmt(topHosted.pnl)}, per-battle ${fmt(topHosted.avg)}, ${topHosted.battles} battles`);
  if (us) console.log(`   Skeet per-battle ${fmt(us.avg)} vs house ${fmt(topHosted.avg)} → ${us.avg >= topHosted.avg ? "AHEAD" : "behind"} on the level (per-battle) basis.`);

  // Dissolution head-to-head (Skeet's chosen strategy) — any agent self-labeled dissolution
  const disso = A.filter((a) => /dissol/i.test(a.type) || /dissol/i.test(a.name));
  if (disso.length) {
    console.log(`\n🧪 DISSOLUTION peers (Skeet's strategy archetype):`);
    disso.sort((a, b) => b.avg - a.avg).forEach((a) => console.log(`   ${a.name} [${a.team}] per-battle ${fmt(a.avg)} · cumPnL ${fmt(a.pnl)} · ${a.battles} btl`));
  }

  console.log(`\n🏆 TOP 10 — CUMULATIVE PnL`);
  byPnl.slice(0, 10).forEach((a, i) => console.log("   " + row(a, i, "pnl")));

  console.log(`\n⚡ TOP 12 — PER-BATTLE PnL (the lever under the ~100/round cap)`);
  byAvg.slice(0, 12).forEach((a, i) => console.log("   " + row(a, i, "avg")));

  console.log(`\n🛠️  TOP 10 CUSTOM agents — the actual Builder-Bounty field (by per-battle)`);
  customByAvg.slice(0, 10).forEach((a, i) => console.log("   " + row(a, i, "avg")));
  console.log("");

  // ── Timestamped snapshot (PnL trail + latest table) ──────────────────────
  const ts = new Date().toISOString();
  const topCustom = customByAvg[0];
  const snapshot = {
    ts,
    field: { agents: A.length, custom: custom.length, hosted: hosted.length, profitable: A.filter((a) => a.pnl > 0).length },
    skeet: us
      ? {
          name: us.name, pnl: us.pnl, avg: us.avg, battles: us.battles, wins: us.wins, losses: us.losses,
          rankPnl: rankOf(byPnl, us), rankAvg: rankOf(byAvg, us),
          customRankPnl: rankOf(customByPnl, us), customRankAvg: rankOf(customByAvg, us),
        }
      : null,
    topHosted: { name: topHosted.name, pnl: topHosted.pnl, avg: topHosted.avg },
    topCustom: { name: topCustom.name, pnl: topCustom.pnl, avg: topCustom.avg },
  };

  mkdirSync(DOCS_DIR, { recursive: true });
  appendFileSync(TRAIL_FILE, JSON.stringify(snapshot) + "\n");

  const md = `# 📊 Benchmark — Latest Snapshot

> Auto-generated by \`npm run benchmark\`. Append-only trail: \`docs/benchmark_snapshots.jsonl\`.
> Source: ${LEADERBOARD_URL}

**As of:** ${ts}

**Field:** ${A.length} agents · CUSTOM ${custom.length} / HOSTED ${hosted.length} · profitable ${snapshot.field.profitable}/${A.length}

## Skeet
${
  us
    ? `| metric | value |
|---|---|
| cumulative PnL | **${fmt(us.pnl)}** |
| per-battle | **${fmt(us.avg)}** |
| battles | ${us.battles} (${us.wins}W/${us.losses}L, ${pct(us.wins, Math.max(1, us.battles))} win) |
| overall rank | #${snapshot.skeet!.rankPnl}/${A.length} by PnL (top ${pct(snapshot.skeet!.rankPnl, A.length)}) · #${snapshot.skeet!.rankAvg}/${A.length} per-battle |
| custom-only rank | #${snapshot.skeet!.customRankPnl}/${custom.length} by PnL · #${snapshot.skeet!.customRankAvg}/${custom.length} per-battle |`
    : "_Not on the leaderboard this run (battles paused / not yet ranked)._"
}

## Benchmarks
- **House (top hosted):** ${topHosted.name} — cumPnL ${fmt(topHosted.pnl)}, per-battle ${fmt(topHosted.avg)}
- **Top custom (per-battle):** ${topCustom.name} — per-battle ${fmt(topCustom.avg)}, cumPnL ${fmt(topCustom.pnl)}

## Top 10 — cumulative PnL
| # | agent | team | PnL | per-battle | battles |
|---|---|---|---|---|---|
${byPnl.slice(0, 10).map((a, i) => `| ${i + 1} | ${a.name}${a.ours ? " ⭐" : ""} | ${a.team} | ${fmt(a.pnl)} | ${fmt(a.avg)} | ${a.battles} |`).join("\n")}

## Top 12 — per-battle PnL (the lever under the ~100/round cap)
| # | agent | team | per-battle | PnL | battles |
|---|---|---|---|---|---|
${byAvg.slice(0, 12).map((a, i) => `| ${i + 1} | ${a.name}${a.ours ? " ⭐" : ""} | ${a.team} | ${fmt(a.avg)} | ${fmt(a.pnl)} | ${a.battles} |`).join("\n")}
`;
  writeFileSync(LATEST_FILE, md);
  console.log(`📝 snapshot appended → docs/benchmark_snapshots.jsonl`);
  console.log(`📝 latest table written → docs/BENCHMARK_LATEST.md\n`);
}

main().catch((e) => {
  console.error("benchmark failed:", e.message);
  process.exit(1);
});
