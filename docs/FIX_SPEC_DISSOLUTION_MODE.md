# 🔧 Fix Spec — Dissolution-Optimizer Mode (non-conflicting pivot)

> For the coding model. This is an **additive, toggleable second strategy** — the momentum logic stays 100% intact. Switch via one config flag. Use this if the (now-measurable) momentum PnL stays flat/negative over ~30 selective rounds.
>
> **Prereq:** `FIX_SPEC_PNL.md` must be applied first, so PnL is real and the two strategies can be compared honestly.

---

## The thesis (why this fits a pump-and-dump market)
Dissolution splits two pools (from protocol docs):
- **Trading budget** (all agents' leftover USDC) → split by **USDC holdings**.
- **Pool USDC** (the AMM reserve) → split by **token holdings** at T=180.

Momentum entry loses here because tokens **spike then crash inside the window** — you buy the pump and it dumps. The dissolution play does the **opposite and momentum-independent** thing:

> Stay in USDC while the herd pumps-and-dumps. **Late in the round, after the token has crashed and most agents have sold back to USDC, buy cheap tokens** to hold a large share of the (few) remaining token holders — then **hold through dissolution** to claim an outsized slice of the AMM's USDC reserve.

If the herd dumped, `yourTokens / totalTokensHeld` is large, and `poolReserveUSDC × thatShare` can exceed your small buy-in. Downside is bounded by the buy-in (≤ deployable, ≤ 1,000).

---

## STEP 0 — Verify the dissolution formula FIRST (do not skip)
This strategy depends entirely on *how* tokens are valued at the split. Confirm before trusting it:
- From protocol docs / Telegram: is pool-USDC truly split **pro-rata by token holdings among agents** (not by market price)? Does buying late meaningfully move the reserve?
- **Observe one real dissolution** with the now-correct PnL accounting: hold a tiny token position to T=180 in *one* round and record buy-in vs. payout. Confirm the directionality before scaling.
- Record findings in `docs/OPEN_QUESTIONS.md`.

If the split is by market price (not token-holdings pro-rata), this thesis is wrong — stop and tell the human.

---

## DESIGN — additive mode, zero conflict

### 1. `src/config.json` + `types.ts`
```jsonc
"STRATEGY_MODE": "momentum",   // "momentum" (current) | "dissolution"
"DISSO_ACCUMULATE_T": 150,     // start accumulating tokens at t≥150 (last ~30s)
"DISSO_MIN_CRASH_PCT": -0.40,  // only accumulate if price has crashed ≥40% from peak/ref
"DISSO_MAX_BUYIN_USDC": 200    // cap the dissolution bet (bounded downside, ≤ deployable)
```
`types.ts`: add these to `AgentConfig` (all optional).

### 2. `src/decide.ts` — branch at the top, leave momentum untouched
Wrap the existing logic so momentum is the default and dissolution is a parallel branch:
```ts
const mode = config.STRATEGY_MODE ?? "momentum";

if (phase === "MARKET_MAKING") return { type: "HOLD" };

if (mode === "dissolution") {
  return decideDissolution(ctx, stats, config);   // new pure helper
}

// ---- existing momentum logic unchanged below ----
```
Add a new **pure** helper `decideDissolution(ctx, stats, config): Action`:
```ts
function decideDissolution(ctx, stats, config): Action {
  const { phase, t, price, position, reserves } = ctx;
  if (phase !== "TRADING") return { type: "HOLD" };

  const accumT   = config.DISSO_ACCUMULATE_T ?? 150;
  const crashPct = config.DISSO_MIN_CRASH_PCT ?? -0.40;
  const cap      = config.DISSO_MAX_BUYIN_USDC ?? 200;
  const ref      = stats.getReferencePrice();
  const drawdown = ref > 0 ? (price - ref) / ref : 0;

  // 1. Stay flat (USDC) for the whole pump-and-dump.
  if (t < accumT) return { type: "HOLD" };

  // 2. Late window: accumulate ONLY if the token has crashed (cheap tokens, herd has dumped)
  //    and the pool still holds a meaningful USDC reserve worth claiming.
  if (position <= 0 && drawdown <= crashPct && reserves > cap) {
    const deployable = ctx.deployable ?? Infinity;
    const amount = Math.min(cap, deployable);
    if (amount >= (config.MIN_SIZE_USDC ?? 50)) return { type: "BUY", amount };
  }

  // 3. HOLD tokens THROUGH dissolution — do NOT exit. (the whole point)
  return { type: "HOLD" };
}
```
- **No 162s exit, no stop-loss, no reversal trim** in this mode — those are momentum constructs and would defeat the thesis. Because we branch *before* the momentum block, none of them run. ✅ (This is the only behavioral "conflict," and the early branch resolves it cleanly.)
- Capital is capped at `DISSO_MAX_BUYIN_USDC` (≤ deployable) so a wrong bet costs little.

### 3. `src/feed.ts` — mode-aware execution (minimal)
- The existing trade-execution block already handles BUY/SELL via `decide()`'s output, so **no change needed** for buys.
- **Guard the dissolution hold:** in `"dissolution"` mode, the agent should *not* be force-sold by any leftover logic — there is none in `decide()` for this mode, so confirm `feed.ts` doesn't independently trigger sells. (It doesn't — all sells originate from `decide()`.)
- Keep the per-round `enteredThisRound` guard (one accumulation buy per round).
- The round-boundary PnL accounting from `FIX_SPEC_PNL.md` measures this mode correctly — the dissolution payout lands as a balance delta at the next round start.

### 4. Switching
- Default stays `"momentum"`. To test the pivot: set `"STRATEGY_MODE": "dissolution"`, restart daemon.
- **A/B method:** run momentum ~30 rounds, record on-chain PnL; switch to dissolution ~30 rounds, compare. The corrected PnL accounting makes this a real comparison.

---

## TESTS (`test/decide.test.ts`)
1. **Mode routing:** `STRATEGY_MODE="dissolution"` → momentum breakout inputs that would BUY in momentum mode return `HOLD` before `accumT`.
2. **No early action:** dissolution mode, `t < DISSO_ACCUMULATE_T` → always `HOLD`.
3. **Late accumulate on crash:** `t≥accumT`, `drawdown ≤ DISSO_MIN_CRASH_PCT`, `reserves > cap`, `position=0` → `BUY` capped at `DISSO_MAX_BUYIN_USDC`.
4. **No accumulate without crash:** `t≥accumT` but `drawdown` shallow → `HOLD`.
5. **Holds through dissolution:** dissolution mode with `position>0` near T=180 → `HOLD` (never SELL_ALL).
6. **Momentum mode unchanged:** all existing momentum tests still pass (default mode).

---

## VERIFICATION
1. `npm test` green; `npm run typecheck` clean; **all existing momentum tests still pass** (proves non-conflict).
2. `STRATEGY_MODE="momentum"` behaves exactly as before (regression check).
3. Flip to `"dissolution"`, restart, watch a few rounds:
   - Agent stays flat (HOLD) through the pump-and-dump.
   - Near t≥150, on a crashed token with a live reserve, it makes ONE small capped buy and holds to dissolution.
   - Round-boundary PnL (from FIX_SPEC_PNL) shows the realized result.
4. Reconcile DB cumulative PnL vs on-chain total (same check as FIX_SPEC_PNL).

**Done = the mode is selectable, momentum is untouched, and you can A/B the two strategies on real PnL.**

---

## ⚠️ Honesty notes (human)
- This is a **hypothesis**, not a guaranteed edge. It hinges entirely on STEP 0 (the split really being token-holdings pro-rata) and on the herd actually dumping. Verify with one real dissolution before scaling the cap.
- Risk: if many agents run the same "claim the reserve" play, the split dilutes; if the protocol values tokens at market price at T=180, holding a crashed token = loss. The `DISSO_MAX_BUYIN_USDC` cap bounds the damage while you test.
- Keep the momentum mode as the default until dissolution mode demonstrably beats it on the real, reconciled PnL — and on the `dash.creator.bid` leaderboard.
