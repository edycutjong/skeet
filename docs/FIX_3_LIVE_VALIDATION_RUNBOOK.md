# 🏁 FIX 3 — Live Validation Runbook (mode re-confirm under the new pump-and-dump meta)

> For whoever drives the daemon. **Goal:** decide, on live post-rule-change data, whether `STRATEGY_MODE` stays `"dissolution"` or flips to `"momentum"` — and prove the agent actually trades again after FIX 1.
> **Deadline:** finish and lock the decision **before Jun 3 16:00 UTC** (then again re-check before Jun 4 16:00 UTC if anything looks off).
>
> Context: FIX 1/2/4 are DONE (see `FIX_SPEC_NO_MARKETMAKING.md`). The market-making phase is gone — *"there is no market making, advantage to the first buyer, it's just pump and dump now."* That means (a) dissolution now depends entirely on the new open-tick reference seeded by FIX 1, and (b) an early-momentum play may now be viable. We don't know which is better live. This runbook settles it.

A round is ~3.5 min, so **10–15 rounds ≈ 35–55 min** of wall-clock per mode. Budget ~2 hours total to test both and decide.

---

## STEP 0 — Pre-flight (2 min)

```bash
cd /Users/edycu/Projects/Hackathon/Skeet
git rev-parse --abbrev-ref HEAD          # know which branch you're on
grep -E "STRATEGY_MODE|DISSO_|EXIT_DEADLINE_S" src/config.json
npm run typecheck && npm run test        # must be green before you trust live behavior
```
Confirm secrets are present and **gitignored** (never commit these): `ACCESS.md`, `.env`, `.agent.json`.
Confirm `src/config.json` shows `"STRATEGY_MODE": "dissolution"` for the first pass.

---

## STEP 1 — Run dissolution live, ~10–15 rounds (45 min)

```bash
npm start 2>&1 | tee docs/live_dissolution_$(date -u +%Y%m%dT%H%M%SZ).log
```

While it runs, watch for these three things in the log — **all three must be true** or dissolution is still broken:

1. **Reference seeds non-zero every round:** `[FEED] ref seeded <price>` prints a **non-zero** price within the first second or two of each new battle (not `0`). This is the FIX 1 payoff.
2. **It actually BUYs on crashed rounds:** on a round that dumps ≥40% off the open after `t≥150`, you see a `[FEED] BUYing <n> USDC worth of <TOKEN>` line. If tokens never crash that far in a 180s round, note it (see "Tuning" below).
3. **It HOLDS through dissolution:** in dissolution mode the agent should **not** force-exit at `EXIT_DEADLINE_S` (162s) — it holds to claim the pro-rata reserve. You should NOT see a blanket `SELL_ALL` right at ~162s.

Let it run **at least 10 completed rounds.** Leave it; don't babysit each tick.

---

## STEP 2 — Read the DB, not your gut (5 min)

Every round is persisted to `skeet.sqlite` (`rounds` table). Pull the last 15:

```bash
sqlite3 -header -column skeet.sqlite \
  "SELECT substr(game_id,1,10) AS game, ref_price, entered, buy_usdc,
          round(pnl_usdc,2) AS pnl, round(bankroll_after,2) AS bankroll,
          datetime(ts/1000,'unixepoch') AS t
   FROM rounds ORDER BY ts DESC LIMIT 15;"
```

Then the dissolution scorecard:

```bash
sqlite3 skeet.sqlite \
  "SELECT count(*) AS rounds,
          sum(entered) AS entered_rounds,
          sum(ref_price=0) AS ref_unseeded_BAD,
          round(avg(pnl_usdc),2) AS avg_pnl,
          round(sum(pnl_usdc),2) AS total_pnl
   FROM (SELECT * FROM rounds ORDER BY ts DESC LIMIT 15);"
```

**Pass criteria for dissolution:**
- `ref_unseeded_BAD = 0` → FIX 1 holds on live data (no round ran with ref_price=0). **If this is >0, stop — FIX 1 regressed; nothing else matters.**
- `entered_rounds ≥ ~3` of the sampled rounds → the crash gate is firing, not bricked.
- `avg_pnl > 0` and ideally trending toward the dissolution peer (AhooCodexArb ~+76/battle on the last benchmark).

**If `entered_rounds = 0`:** the −40% crash never triggers (tokens may not dump that hard now, or they dump *before* `t=150`). This is the most likely failure. Two options, in order:
- Quick tune (still dissolution): lower the crash threshold and the accumulate-start in `src/config.json`, e.g. `"DISSO_MIN_CRASH_PCT": -0.25`, `"DISSO_ACCUMULATE_T": 120`. Re-run STEP 1 for ~10 rounds. (Re-run `npm test` first — these are exercised by the dissolution tests.)
- If it still won't enter or PnL stays ≤0 → go to STEP 3 (flip to momentum).

---

## STEP 3 — A/B against momentum (45 min) — only if dissolution underperforms

The new "first-buyer advantage" meta may reward being *early on the pump and trimming before the dump* — which is what momentum mode does. Test it head-to-head.

```bash
# 1. Stop the daemon (Ctrl-C).
# 2. Flip the mode:
#    edit src/config.json -> "STRATEGY_MODE": "momentum"
npm run typecheck && npm run test        # stay green
npm start 2>&1 | tee docs/live_momentum_$(date -u +%Y%m%dT%H%M%SZ).log
```

Run ~10 rounds, then the same scorecard (the SQL in STEP 2 is mode-agnostic — it reads `rounds`). Momentum mode WILL force-exit by `EXIT_DEADLINE_S` (162s) — that's expected, the `exit_t` column should be populated.

**Compare the two windows directly** — separate the dissolution rounds from the momentum rounds by timestamp (use the `t` from the STEP 2 query, or split on the run start time):

```bash
sqlite3 skeet.sqlite \
  "SELECT round(avg(pnl_usdc),2) AS avg_pnl, round(sum(pnl_usdc),2) AS total, count(*) AS n
   FROM rounds WHERE ts >= <momentum_run_start_ms>;"
```

---

## STEP 4 — Cross-check vs the field (2 min)

```bash
npm run benchmark
```
This appends a timestamped snapshot to `docs/benchmark_snapshots.jsonl` and rewrites `docs/BENCHMARK_LATEST.md`. Confirm Skeet's **per-battle** number has moved off the stale +3 in the direction your live DB sample predicts. The leaderboard lags, so trust the DB sample for the *decision* and use the benchmark to corroborate the trend.

---

## STEP 5 — Decide & lock (5 min)

Pick the mode with the **higher average per-battle PnL over its live sample** (per-battle is the only lever under the ~100 USDC/round auto-refilled cap — cumulative is a head-start artifact):

| Outcome | Action |
|---|---|
| Dissolution `avg_pnl` > momentum, and `entered_rounds ≥ 3` | Keep `"STRATEGY_MODE": "dissolution"`. |
| Momentum `avg_pnl` > dissolution | Set `"STRATEGY_MODE": "momentum"` in `src/config.json`. |
| Both ≈ 0 / negative | Keep whichever loses less; note it as an honest limitation; do NOT overclaim in the deck. |

Then:
```bash
npm run typecheck && npm run test                 # final green
# leave the daemon RUNNING in the winning mode through the 16:00 UTC snapshot
npm start 2>&1 | tee docs/live_final_$(date -u +%Y%m%dT%H%M%SZ).log
```

Record the decision + the numbers that drove it in `FIX_SPEC_NO_MARKETMAKING.md` (flip FIX 3 from ⏳ OPEN to ✅), and refresh the standing line in `docs/SUBMISSION.md` / `docs/STRATEGY_STATUS.md` from `docs/BENCHMARK_LATEST.md`.

---

## Guardrails
- **Honest framing only.** Never claim "beat the house." The pitch is net-profitable + per-battle quality + on-chain verifiability.
- **Don't commit secrets.** `ACCESS.md` / `.env` / `.agent.json` stay gitignored. The live logs in `docs/` may contain addresses but must not contain the access code — skim before committing any log.
- **The agent self-refills** to ~100 USDC/round; you can't win on size. Every tuning decision is about per-battle edge, not bankroll.
- **Time-box it.** If you're past ~1.5 h and the data is noisy, keep the current mode, log the ambiguity, and re-check before the Jun 4 snapshot rather than thrashing config before Jun 3.

**Done = the daemon is running in the empirically-chosen mode with a non-zero seeded reference every round, the DB shows it actually trading (entered>0) with the better per-battle PnL, the decision + numbers are recorded, and it's left running through 16:00 UTC.**
