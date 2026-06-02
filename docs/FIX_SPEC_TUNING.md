# 🔧 Fix Spec — Strategy Tuning (false-breakout entry + guards)

> For the coding model. **Surgical tuning, not a redesign.** Follows the funding fix (`FIX_SPEC_FUNDING.md`), which is already working (BUYs now execute at size 98 = deployable).

## What the first real trade revealed (round `0xa203…1817`)
Tick trace: `t=0 price 0.033 (stale) → t=2 price 4.83 → t=8 BUY@5.04 → price crashes → t=27 SELL_ALL@4.23 (−16%) → token ends at 0.22`.

**Corrected diagnosis (important):**
- The `exit_t=30` is **not** a clock bug — `t` is correct (`mmEndAt` present, t=0 at trading start). Entry was at **t=8**.
- The **stop-loss did its job** — the token dumped from ~5.0 to **0.22**; exiting at −16% beat holding to −95%. **Do NOT widen the stop.**
- The real bug is a **false-breakout ENTRY**: the stale first tick (`0.033`) seeds the EMAs, dragging `emaSlow` artificially low. That makes `emaFast > emaSlow` **trivially true** on the first up-move, so the agent buys *any* early spike — including pump-and-dump tops. It bought the top and got correctly stopped out.

**Priority:** fix entry quality first. The capital-protection exits are fine.

---

## FIX 1 (PRIMARY) — stop the EMA-seed pollution / false breakouts

### 1a. `src/signals.ts` — don't seed on the stale first tick
The first tick of a battle is consistently a stale/pre-MM price. Seed the EMAs on the **second** observed price instead.
- Add a private flag `private seeded = false;` and a discard of the first call:
```ts
public update(price: number, volume: number = 0) {
  if (price <= 0 || isNaN(price)) return;

  this.state.tickCount++;
  this.state.priceHistory.push(price);
  if (this.state.priceHistory.length > 100) this.state.priceHistory.shift();

  // Discard the first observed tick (stale pre-MM price); seed EMAs on the 2nd.
  if (!this.seeded) {
    this.seeded = true;
    this.lastPrice = price;
    this.peakPrice = price;
    // leave emaFast/emaSlow at 0 until the next tick seeds them
    return;
  }
  if (this.state.emaFast === 0) {           // seed on first POST-discard price
    this.state.emaFast = price;
    this.state.emaSlow = price;
    this.lastPrice = price;
    this.peakPrice = price;
    return;
  }
  // ...existing EMA update / logReturns / peak / vol code unchanged...
}
```
- Reset `seeded` per battle: it's a fresh `new Signals(...)` each battle (see `feed.ts`), so no extra reset needed — just confirm a new instance is created on `isNewBattle` (it is).

### 1b. `src/config.json` + `src/decide.ts` — warm-up gate before any entry
Don't trust signals until the EMAs have converged. Add:
```jsonc
"WARMUP_TICKS": 8,
"MIN_BREAKOUT_PCT": 0.015   // price must exceed refPrice by ≥1.5%, not just >
```
In `decide.ts`, in the momentum-entry block, require warm-up AND a *meaningful* breakout:
```ts
const ready = stats.getTickCount() >= config.WARMUP_TICKS;
const breakout =
  ready &&
  emaFast > emaSlow &&
  price > refPrice * (1 + config.MIN_BREAKOUT_PCT) &&
  volumeRising;
```
- `WARMUP_TICKS=8` (~12s at the 1.5s loop) lets `emaSlow` converge so the cross is real, not a seed artifact.
- `MIN_BREAKOUT_PCT` filters micro-noise breakouts.
- Apply the `ready` gate to the **predator** BUY branch too.

---

## FIX 2 — convert the reversal trim into a proper trailing stop (lock gains)
These tokens can pump *then* dump inside the window, so the trailing exit matters more than the 162s backstop. The current `isReversalDetected()` uses a hardcoded −3% from peak (too jumpy) and an EMA-cross. Make the trail configurable and a touch wider:
- `src/config.json`: add `"REVERSAL_TRAIL_PCT": -0.06`.
- `src/signals.ts` `isReversalDetected()`: replace the hardcoded `-0.03` with the config value (pass config in, or add a setter). Keep the `emaFast < emaSlow after tickCount>5` clause.
- **Do NOT change `STOP_LOSS_PCT` (−0.08)** — verified protective this round. (If anything, a vol-scaled *tighten* could be explored later, but leave it for now.)

---

## FIX 3 — prevent double-entry (one buy per round)
BUY fired at t=8 and t=11 (position read lags tx confirmation). Add a per-round guard in `src/feed.ts`:
- Declare `let enteredThisRound = false;` near the other round-state vars.
- Reset it on `isNewBattle` (with the other resets).
- Set `enteredThisRound = true` inside the BUY execution block after `executeSwap` is **submitted**.
- Gate the BUY execution: `if (action.type === "BUY" && action.amount && !enteredThisRound) { … }`.
- This bridges the confirmation gap so a second BUY can't fire before the first mines.

---

## FIX 4 — stop re-issuing SELL_ALL after exit
SELL_ALL fired at t=27,33,36,39 (position read lagged the sell). Add a per-round `exitedThisRound` flag in `feed.ts`:
- Reset on `isNewBattle`.
- Set `true` after a SELL_ALL is submitted.
- Skip further trade execution for the round once `exitedThisRound` is true.
- Keep logging ticks, but don't re-submit sells. (Prevents wasted gas + log noise, and surfaces if a sell actually failed vs. just lagged.)

---

## FIX 5 (INVESTIGATE, no code yet) — verify `currentPrice` units
Prices ranged `0.033 → 4.83 → 6.30 → 0.22` in one round. Some of that is real launch volatility, but confirm scale:
- Log raw `game.token.currentPrice` alongside pool reserves for a few rounds.
- Sanity-check against the AMM pool (`reserves_usdc` / token reserves) to confirm `currentPrice` is USDC-per-token at the expected decimals.
- If the field is already correct, this is just extreme volatility (which Fixes 1–2 handle). If it's mis-scaled, entries/stops are computing on wrong numbers — fix the source.

---

## TESTS (`test/signals.test.ts`, `test/decide.test.ts`)
1. **Stale-first-tick discarded:** feed `[0.033, 5.0, 5.0, 5.0]` → after seeding, `emaSlow` ≈ 5.0 (not dragged toward 0.033); `getTickCount()` reflects discard rule.
2. **Warm-up gate:** breakout inputs true but `tickCount < WARMUP_TICKS` → `decide` returns `HOLD`.
3. **MIN_BREAKOUT_PCT:** `price` only 0.5% above `refPrice` → no BUY; ≥1.5% above → BUY.
4. **No double-entry:** simulate two consecutive BUY-eligible ticks with `enteredThisRound` semantics → only one execution path taken. (Unit-test the guard logic if extracted; otherwise cover in a feed-level test.)
5. **Reversal trail uses config:** peak then −6% → `isReversalDetected()` true at the configured threshold, false at −4%.
Update existing `GameContext` fixtures for any new fields.

---

## VERIFICATION
1. `npm test` green (incl. new cases). `npm run verify-offline` still passes.
2. **Live:** restart daemon, watch several rounds:
   - Entries should now be **rarer and later** (warm-up + real breakout) — fewer false buys on spikes.
   - When it does enter, confirm it's on a *sustained* up-move, not the first tick.
   - One BUY per round (no t=8/t=11 doubles); one SELL path (no repeated SELL_ALL).
3. Watch cumulative PnL trend in SQLite:
   ```bash
   node -e "const D=require('better-sqlite3');const db=new D('skeet.sqlite');console.log(db.prepare('SELECT COUNT(*) rounds, SUM(entered) entered, ROUND(SUM(pnl_usdc),2) pnl FROM rounds').get())"
   ```
   Goal: entries become selective and the PnL stops bleeding on false breakouts.

**Done = entries are selective (not buying every early spike), one buy/one sell per round, and PnL trend improves over ~10–20 rounds.**

---

## ⚠️ Strategic note (for the human, not the coder)
These launch tokens can pump-and-dump *within* the 180s window (this one went 5.0 → 0.22). That means the **trailing/stop exit is doing the heavy lifting**, and the "hold to 162s dissolution-frontrun" only pays off on tokens that *don't* collapse early. After these fixes, watch whether momentum entry is profitable at all on this market — if most tokens spike-and-crash, the edge may shift toward **smaller, faster scalps with tight trailing stops** rather than holding. Let the live PnL over 20–30 rounds decide; tune `WARMUP_TICKS`, `MIN_BREAKOUT_PCT`, and `REVERSAL_TRAIL_PCT` from real data.
