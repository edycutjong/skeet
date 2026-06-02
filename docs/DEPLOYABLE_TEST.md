# 🧪 Deployable-Capital Test — can we bet > trading-Safe balance?

> Run this **the moment battles resume** (not while paused). Goal: settle whether buy-ins are capped at the ~100 trading-Safe balance **(a)** or auto-draw from treasury up to 1,000 **(b)**. Outcome (b) is a ~10× PnL unlock.
>
> ⏱️ ~10 min, ~1–3 rounds. Modest test size (300) bounds the risk. **Revert the change right after.**

## Background
- Mod says trading Safe is "auto funded from the treasury." On-chain shows a **100 USDC treasury→trading reset at settlement**. Pre-clamp ~500 buys **reverted**; ~98 buys **landed** → evidence leans **(a)**. This test confirms definitively.
- Current clamp (correct for (a)): `feed.ts` computes `deployable = tradingUsdcNum * 0.98`, and `decide.ts` does `amount = min(kellySize, MAX_BUYIN_USDC, deployable)`.

## STEP 1 — make ONE temporary change (revert after)
In `src/feed.ts`, where `deployable` is computed, hard-code a test value **above** the trading-Safe balance:
```ts
// ⚠️ TEMPORARY DEPLOYABLE TEST — revert after 1–3 rounds
const deployable = 300;   // was: tradingUsdcNum * 0.98
```
(300 > the ~100 in the trading Safe, but well under the 1,000 cap and small enough to limit risk.)

Optional, to trigger an entry faster for the test, you *may* also temporarily relax entry (`ENTRY_MIN_T` 15→5) — but revert that too.

## STEP 2 — restart & capture a buy
```bash
pkill -f "src/index.ts" && npm start
```
Watch the logs for the first breakout entry:
- `[FEED] BUYing 300 USDC worth of …`
- Then **one of two things**:
  - ✅ **No error** → the swap executed for 300 even though the Safe held ~100 → **outcome (b)**.
  - ❌ `[FEED] Trade execution failed: …reverted / insufficient…` → **outcome (a)**.

## STEP 3 — confirm on-chain (the decisive check)
Right after the buy attempt:
```bash
node -e "const {ethers}=require('ethers');const p=new ethers.JsonRpcProvider('http://5.161.35.78:8545',42069,{staticNetwork:true});const u=new ethers.Contract('0xed38c197b319fdc067f4c3fb58eec1a733a36cf4',['function balanceOf(address) view returns (uint256)'],p);(async()=>{console.log('trading',(+ethers.formatUnits(await u.balanceOf('0x06b82e068cf1ba5883cd6c866a62391212e18a1d'),18)).toFixed(2));console.log('treasury',(+ethers.formatUnits(await u.balanceOf('0x2a00fb1b96a7ecf2b3d74f456325ffbd6b078bdc'),18)).toFixed(2))})()"
```
- **Treasury dropped by ~300 (more than the usual 100)** and the buy went through → **(b): buy-in auto-draws from treasury.** 🎉
- Treasury unchanged / buy reverted → **(a): capped at the trading-Safe balance.**

## STEP 4 — act on the result
- **If (b):** remove the deployable clamp (or set `deployable = MAX_BUYIN_USDC`), and let Kelly size against the full bankroll up to **1,000/game**. This is a major per-battle-PnL unlock — likely your best shot at a daily prize. Re-tune Kelly fraction conservatively (bigger bets = bigger variance; keep the drawdown throttle + circuit breaker).
- **If (a):** **revert the test change** (restore `deployable = tradingUsdcNum * 0.98`), accept ~100/round as the ceiling, and pursue the **dissolution pivot** (`FIX_SPEC_DISSOLUTION_MODE.md`) — payout = pool-reserve share, which can be multiples of the 100 buy-in.

## ⚠️ Cleanup
- **Revert** the temporary `deployable = 300` (and any `ENTRY_MIN_T` change) regardless of outcome.
- Keep the circuit breaker (`MAX_DAILY_LOSS_USDC`) on throughout.
- Don't leave the daemon running with the test value — it bypasses the safe-balance guard.

## Hand to coding model
> "Apply STEP 1 (temporary `deployable = 300` in feed.ts), restart, capture one entry, run STEP 3, report the log + the treasury delta. Then revert per STEP 4."
