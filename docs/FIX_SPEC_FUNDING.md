# 🔧 Fix Spec — "225 BUYs, 0 fills" (deployable-capital mismatch)

> For the coding model. **Do not change strategy logic.** This is a surgical fix to one bug.

## Root cause (verified on-chain)
- trading Safe = **100 USDC**, treasury Safe = **9,900 USDC**, EOA gas = 2 ETH, USDC decimals = 18.
- `feed.ts` sums both Safes → `bankroll = 10,000`, so `decide()` Kelly-sizes a buy of `0.5 × 0.10 × 10,000 ≈ 500 USDC`.
- Trades execute **from the trading Safe (100 USDC)** → every ~500 USDC swap **reverts / is rejected**. Result: 225 BUY decisions, 0 entered.

**Principle of the fix:** never let a BUY be larger than what the trading Safe can actually spend. Keep Kelly sizing against *total* bankroll for risk math, but **clamp the executable amount to deployable (trading-Safe) capital.**

---

## STEP 0 — Verify the funding model first (5 min, do before coding)
Confirm how the trading Safe is *meant* to be funded, because it changes whether we can unlock bigger sizes:
- Check the protocol quick-start / Telegram: is the trading Safe auto-funded from treasury at buy-in, or must the agent transfer treasury → trading itself?
- Check whether the **Roles modifier** permits an ERC-20 `transfer` from treasury → trading Safe, or **only** the trading functions (`tradeViaFactory`, `approveFactory`). If only trading is permitted, treasury funds are **not** movable by the agent and the trading-Safe balance is a hard ceiling.

Record the answer in this file.

### Verification Answer:
The Safe Roles modifier is scoped specifically to execute transactions targeting `traderHelperAddress` (`0x521FAcaAB630E30614617c9ae5f6508cB4213540`) using a hardcoded `to` address and specific `roleKey`. The agent does not have permissions to call `transfer` on the USDC contract from the treasury Safe to transfer funds to the trading Safe. Therefore, the trading-Safe balance is a hard ceiling and the Optional Enhancement should be skipped. We will implement the Primary Fix.

---

## PRIMARY FIX (unblocks trading immediately) — clamp BUY to deployable capital

### 1. `src/types.ts` — add deployable capital to context
In `GameContext`, add:
```ts
  deployable: number;   // USDC actually spendable from the trading Safe this round
```

### 2. `src/feed.ts` — pass the trading-Safe balance as `deployable`
- You already compute `tradingUsdc` (the trading-Safe USDC balance) and `usdcBalNum`/`currentBankroll`.
- Derive a deployable number from the **trading Safe only**, with a tiny safety buffer so rounding/slippage can't tip it over:
```ts
  const tradingUsdcNum = parseFloat(ethers.formatUnits(tradingUsdc, 18));
  const deployable = Math.max(0, tradingUsdcNum * 0.98); // 2% buffer
```
- Add `deployable` to the `ctx` object passed to `decide()`:
```ts
  const ctx: GameContext = {
    phase, t, price,
    reserves: reservesUsdc,
    position: tokBalNum,
    bankroll: currentBankroll > 0 ? currentBankroll : config.START_BANKROLL,
    peakBankroll,
    entryPrice,
    deployable,            // <-- new
  };
```

### 3. `src/decide.ts` — clamp every BUY to `deployable`, then re-check MIN_SIZE
Both BUY return sites (the predator branch and the momentum branch) currently do:
```ts
  const size = kellySize(winRate, bankroll, peakBankroll, config);
  if (size > config.MIN_SIZE_USDC) {
    return { type: "BUY", amount: Math.min(size, config.MAX_BUYIN_USDC) };
  }
```
Change the executable amount to also clamp to `ctx.deployable`, and re-test MIN_SIZE **after** clamping:
```ts
  const size = kellySize(winRate, bankroll, peakBankroll, config);
  const amount = Math.min(size, config.MAX_BUYIN_USDC, ctx.deployable);
  if (amount >= config.MIN_SIZE_USDC) {
    return { type: "BUY", amount };
  }
```
- Apply to **both** BUY sites.
- Rationale: with 100 USDC deployable → `amount = min(500, 1000, 98) = 98` → executes (98 ≥ 50). The buy now lands.
- Keep `bankroll` (total) feeding `kellySize` — risk fraction is still measured against total capital; we only cap what we actually spend. (Clamping down is strictly risk-safe.)

### 4. Keep `decide()` pure
`deployable` is just another field on `ctx`. No I/O added. Do **not** read balances inside `decide()`.

---

## OPTIONAL ENHANCEMENT (only if STEP 0 says treasury → trading is permitted)
If the Roles modifier allows moving USDC between Safes, add a top-up so Skeet can use the full Kelly size (up to the 1,000 cap) instead of being capped at ~100/round:
- In `executor.ts`, add `fundTradingSafe(amountUsdc)` that transfers from treasury → trading Safe via the permitted path.
- In `feed.ts`, **before** a BUY: if `kellySize(...)` (capped at 1000) exceeds the trading-Safe balance, top up the difference, wait for confirmation, then proceed.
- Guard: never move more than needed; respect the 1,000/game buy-in cap; keep a gas buffer.
- If STEP 0 says it's **not** permitted, skip this — the trading-Safe balance is the ceiling and the Primary Fix is the whole fix.

---

## TESTS TO ADD (`test/decide.test.ts`)
1. **deployable clamps the buy:** breakout true, `bankroll=10000` (Kelly→~500), `deployable=98` → expect `BUY` with `amount ≈ 98` (≤ deployable), not 500.
2. **deployable below MIN_SIZE → skip:** `deployable=30`, `MIN_SIZE_USDC=50` → expect `HOLD` (no buy it can't fund).
3. **deployable above Kelly → Kelly wins:** `deployable=5000`, Kelly→500 → `amount=500` (deployable doesn't inflate the bet).
4. **MAX_BUYIN still caps:** huge bankroll + huge deployable → `amount ≤ 1000`.
Update any existing decide tests that construct `GameContext` to include the new `deployable` field.

---

## VERIFICATION (run after the edit)
1. `npm test` green (incl. the 4 new cases).
2. `npm run verify-offline` still passes (exit-before-deadline, cap, non-negative bankroll).
3. **Live:** restart daemon with logs → on the next breakout, expect `[FEED] BUYing ~98 USDC …` followed by **no** "Trade execution failed", and a new `entered=1` row:
   ```bash
   node -e "const D=require('better-sqlite3');const db=new D('skeet.sqlite');console.log(db.prepare('SELECT game_id,entered,buy_usdc,exit_t,pnl_usdc FROM rounds WHERE entered=1 ORDER BY ts DESC LIMIT 5').all())"
   ```
4. Confirm on-chain: trading-Safe USDC ↓ and token balance ↑ after the buy; reversed after the ~162s exit.

**Done = at least one round with `entered=1` and a real on-chain swap.** That's the gate from `SMOKE_TEST.md`.

---

## ⚠️ Secondary check (if STILL 0 fills after this)
If buys are clamped correctly but `entered` stays 0, the blocker is the **approval gate**: `tradingApproved` is false because `approveToken` threw. Look for `[FEED] Approval failed: …` at battle start and fix that path (it's a Roles-modifier `approveFactory` call) — until approval succeeds, the BUY branch at `feed.ts` is skipped entirely.
