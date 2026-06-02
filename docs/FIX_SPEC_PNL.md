# 🔧 Fix Spec — Real PnL Accounting + Entry Selectivity

> For the coding model. Two problems found while monitoring live rounds:
> 1. **PnL accounting is broken** — the DB shows −1,039 over 19 rounds, but on-chain the total is **10,032 (≈ +32, roughly flat).** The DB number is fake and must be fixed before any dashboard/demo/leaderboard claim.
> 2. **Entry isn't selective** — it entered 16 of 19 rounds (84%), buying nearly every token's opening pump.

---

## Root cause — why the PnL is fake
`feed.ts` writes round PnL as `pnl = currentBankroll - peakBankroll` (at SELL_ALL). That's **drawdown-from-peak, which is always ≤ 0 by construction** — not realized PnL. So every round logs a "loss." Also `buy_usdc` ends up `null` because the SELL_ALL `saveRound` upsert overwrites it with `0`/undefined.

**Ground truth = on-chain total USDC across both Safes.** Start = 10,000. Real cumulative PnL = `currentTotalUsdc − START_BANKROLL`. Between rounds, tokens are liquidated (dissolution), so total USDC at a round boundary is clean.

---

## FIX A (PRIMARY) — measure real PnL from balance deltas at round boundaries

### A1. `src/feed.ts` — settle the previous round's PnL when a new battle's balances are known
Add tracking vars (near the other round-state vars):
```ts
let lastSettledTotalUsdc: number | null = null;   // total USDC (both Safes) at last settlement
let lastRoundIdForPnl = "";
let entryUsdcThisRound = 0;                        // amount actually bought this round
```
After balances are read each tick (you already compute `tradingUsdc`, `treasuryUsdc`; let `totalUsdcNum = parseFloat(formatUnits(tradingUsdc+treasuryUsdc, 18))`), settle on a round change:
```ts
if (currentRoundId !== lastRoundIdForPnl) {
  if (lastRoundIdForPnl !== "" && lastSettledTotalUsdc !== null) {
    const realizedPnl = totalUsdcNum - lastSettledTotalUsdc;   // previous round's true PnL
    db.prepare("UPDATE rounds SET pnl_usdc = ? WHERE game_id = ?")
      .run(realizedPnl, lastRoundIdForPnl);
  }
  lastSettledTotalUsdc = totalUsdcNum;   // baseline for the round now starting
  lastRoundIdForPnl = currentRoundId;
}
```
> Place this AFTER the balance reads (so `totalUsdcNum` is populated). The previous round's dissolution has settled by the time the next battle's ticks run, so this captures the full buy-in + sells + dissolution payout net.

### A2. `src/feed.ts` — stop writing the fake PnL and preserve `buy_usdc`
- In the **BUY** branch: set `entryUsdcThisRound = action.amount;` and keep `buy_usdc: action.amount` in `saveRound`.
- In the **SELL_ALL** branch: **remove** `const pnl = currentBankroll - peakBankroll;` and stop writing `pnl_usdc` there (PnL is now set at the next round boundary by A1). When you `saveRound` on sell, pass `buy_usdc: entryUsdcThisRound` (NOT `action.amount || 0`) so the entry size is preserved, and leave `pnl_usdc` as-is (don't overwrite with a fake value) — or omit the column from that update.
- Reset `entryUsdcThisRound = 0;` on `isNewBattle`.

### A3. Cumulative PnL = on-chain truth
Anywhere cumulative PnL is reported (dashboard `getDailyPnL`, telemetry), the canonical value is `currentTotalUsdc − START_BANKROLL`. After A1, `SUM(pnl_usdc)` across rounds will reconcile to this. Add a sanity log once per round:
```ts
console.log(`[PNL] cumulative ≈ ${(totalUsdcNum - config.START_BANKROLL).toFixed(2)} USDC (total ${totalUsdcNum.toFixed(2)})`);
```

### A4. Circuit breaker
`getDailyPnL` now reads real per-round PnL, so the −2,000/day breaker becomes meaningful. No code change beyond A1–A2, but verify it sums the corrected `pnl_usdc`.

---

## FIX B — make entry actually selective (stop buying the open pump)

### Why the warm-up gate failed
`tickCount` accumulates during the 30s MM phase (~20 ticks), so the 8-tick warm-up is already satisfied when trading opens. It then buys the opening spike (entries at t=1, t=5), which on these tokens immediately dumps.

### B1. `src/config.json` — add an entry floor in trading time
```jsonc
"ENTRY_MIN_T": 15,        // no entry in the first 15s of TRADING (let the open spike shake out)
"EMA_MARGIN": 0.004       // require a real cross, not a noise touch
```
(`types.ts`: add `ENTRY_MIN_T?: number; EMA_MARGIN?: number;` to `AgentConfig`.)

### B2. `src/decide.ts` — require time-into-trading + a margin cross
In the momentum-entry block, tighten the gates (apply the time floor to the predator branch too):
```ts
const entryMinT = config.ENTRY_MIN_T ?? 15;
const emaMargin = config.EMA_MARGIN ?? 0.004;

if (position <= 0 && t >= entryMinT && t < config.ENTRY_DEADLINE_S) {
  // ...
  const breakout =
    ready &&
    emaFast > emaSlow * (1 + emaMargin) &&            // margin, not bare >
    price > refPrice * (1 + minBreakoutPct) &&
    volumeRising;
  // ...
}
```
- `t >= ENTRY_MIN_T` skips the violent first 15s where the pump-and-dump happens.
- The EMA margin avoids entering on a marginal cross.
- Net effect: it only enters tokens whose momentum is *still up after the open settles* — the entries that have a chance of surviving to the trailing exit / 162s.

> This is a **hypothesis to validate with the now-real PnL** (Fix A). If it's still flat/negative after ~20–30 selective rounds, the conclusion is that momentum entry doesn't work on this pump-and-dump market and the thesis needs rethinking (see strategic note).

---

## TESTS
`test/feed.test.ts`:
1. **Round-boundary PnL:** simulate total USDC 10,000 → (round A) → 9,950 at next battle start → assert round A's `pnl_usdc` updated to −50 (not drawdown-from-peak).
2. **buy_usdc preserved:** after BUY then SELL_ALL in a round, `buy_usdc` stays the entry amount (not null/0).

`test/decide.test.ts`:
3. **ENTRY_MIN_T:** breakout true but `t < ENTRY_MIN_T` → `HOLD`; same inputs with `t >= ENTRY_MIN_T` → `BUY`.
4. **EMA margin:** `emaFast` only 0.1% above `emaSlow` (< margin) → no BUY; clearly above → BUY.
Update `GameContext`/`AgentConfig` fixtures for the new fields.

---

## VERIFICATION (the key one)
1. `npm test` green; `npm run typecheck` clean.
2. Restart daemon. After a few rounds, **reconcile the two sources** — they must now agree:
   ```bash
   # DB cumulative:
   node -e "const D=require('better-sqlite3');const db=new D('skeet.sqlite');console.log('DB cumPnL:',db.prepare('SELECT ROUND(SUM(pnl_usdc),2) p FROM rounds').get())"
   # On-chain truth (should ≈ DB cumPnL + small in-flight):
   node -e "const {ethers}=require('ethers');const p=new ethers.JsonRpcProvider('http://5.161.35.78:8545',42069,{staticNetwork:true});const u=new ethers.Contract('0xed38c197b319fdc067f4c3fb58eec1a733a36cf4',['function balanceOf(address) view returns (uint256)'],p);(async()=>{const t=await u.balanceOf('0x06b82e068cf1ba5883cd6c866a62391212e18a1d');const r=await u.balanceOf('0x2a00fb1b96a7ecf2b3d74f456325ffbd6b078bdc');console.log('on-chain PnL:',(parseFloat(ethers.formatUnits(t,18))+parseFloat(ethers.formatUnits(r,18))-10000).toFixed(2))})()"
   ```
   **Pass = DB cumulative PnL ≈ on-chain PnL** (within one in-flight round). That means the dashboard/demo numbers are finally real.
3. **Selectivity:** post-fix entry rate should drop well below 84% — it skips tokens that pump-and-dump in the first 15s.

**Done = (a) DB PnL reconciles with on-chain total, and (b) entries are selective.** Only then can you trust the dashboard and judge whether the strategy is actually positive.

---

## ⚠️ Strategic note (human)
You're currently ~flat (+32), not winning. To trigger the bounty you need to clearly beat the top hosted agent's cumulative PnL — check your real rank at **https://dash.creator.bid/**. If, after Fix A+B, ~30 selective rounds are still flat/negative, momentum-entry on this pump-and-dump market is the wrong thesis. The fallback edge to test next: **don't trade the pump at all — accumulate a small position late and optimize the dissolution payout** (the original "dissolution-optimizer" idea), which doesn't depend on momentum surviving.
