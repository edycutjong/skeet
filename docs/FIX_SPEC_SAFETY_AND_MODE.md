# 🔧 Fix Spec — Fail-Closed Deployable + Strategy-Mode Switch

> For whoever drives the agent. Two changes: a 1-line safety fix, and the strategy-mode call backed by live data.

---

## FIX 1 (safety) — `deployable` must fail CLOSED, not open

**Problem:** `decide.ts` falls back to `Infinity` when `ctx.deployable` is undefined:
```ts
const deployable = ctx.deployable !== undefined ? ctx.deployable : Infinity;   // ❌ fail-OPEN
```
`deployable` is the guard that stops the agent sizing a buy larger than the ~100 USDC actually in the trading Safe. Defaulting it to `Infinity` means **if that value is ever missing, the guard is bypassed** and the agent can size a buy up to `MAX_BUYIN_USDC` (1,000) it can't fund (→ revert, wasted gas) — or, if buy-ins *can* draw from treasury, an unintended oversized bet. A capital guard should **fail closed**: if you don't know your spendable capital, bet nothing.

**Change (every occurrence in `src/decide.ts` — momentum branch, predator branch, and the `decideDissolution` helper):**
```ts
const deployable = ctx.deployable !== undefined ? ctx.deployable : 0;   // ✅ fail-CLOSED
```
With `deployable = 0`, `amount = min(size, MAX_BUYIN, 0) = 0`, which is `< MIN_SIZE_USDC` → returns `HOLD`. Safe.

**Test (`test/decide.test.ts`):** breakout conditions all true but `ctx.deployable` undefined → expect **`HOLD`** (not a BUY at MAX_BUYIN). Add for both momentum and dissolution modes.

---

## FIX 2 (strategy) — switch live mode to `dissolution`

**Decision, backed by live data (2026-06-02):**
- Momentum, even retuned with good selectivity (33% entry rate), **lost both entries** (−34.94, −47.53); cumulative −82 since the DB clear; leaderboard PnL **184 → 102**.
- Everyone is capped at **~100 USDC/round** (trading-Safe balance, auto-refilled). So **per-battle edge is the only lever**, and momentum's edge on these pump-and-dump tokens is **negative**.
- The **dissolution thesis is confirmed valid on-chain** (Q3: pool USDC settles pro-rata by token holdings) — and a dissolution payout can be a **multiple of the ~100 buy-in** (how the +85–261/battle leaders likely profit on a capped buy-in).

**Change (`src/config.json`):**
```jsonc
"STRATEGY_MODE": "dissolution"   // was "momentum"
```
Dissolution mode is already implemented + tested (100% coverage). It stays in USDC, accumulates a small capped position late (`t ≥ DISSO_ACCUMULATE_T`) only on crashed tokens (`≤ DISSO_MIN_CRASH_PCT`) with a live pool reserve, and holds through dissolution. Bounded downside (~100/round; circuit breaker on).

**A/B method:** run dissolution **15–20 rounds**, then compare real per-battle PnL to momentum's (negative) record using the reconciliation below. **Flip back to `"momentum"` if dissolution underperforms** — but momentum is the proven loser, so dissolution is the right thing to test.

---

## VERIFICATION
1. `npm test` green (incl. the new fail-closed test); `npm run typecheck` clean.
2. After ~15–20 dissolution rounds, reconcile (must roughly agree, and ideally trend **up**):
```bash
node -e "const D=require('better-sqlite3');const db=new D('skeet.sqlite');console.log('DB cumPnL:',db.prepare('SELECT ROUND(SUM(pnl_usdc),2) p FROM rounds').get())"
node -e "const {ethers}=require('ethers');const p=new ethers.JsonRpcProvider('http://5.161.35.78:8545',42069,{staticNetwork:true});const u=new ethers.Contract('0xed38c197b319fdc067f4c3fb58eec1a733a36cf4',['function balanceOf(address) view returns (uint256)'],p);(async()=>{const t=+ethers.formatUnits(await u.balanceOf('0x06b82e068cf1ba5883cd6c866a62391212e18a1d'),18);const r=+ethers.formatUnits(await u.balanceOf('0x2a00fb1b96a7ecf2b3d74f456325ffbd6b078bdc'),18);console.log('on-chain PnL:',(t+r-10000).toFixed(2))})()"
```
3. Leaderboard rank check (`dash.creator.bid`) — is per-battle PnL rising vs the momentum baseline (+9 → ?).

**Done = fail-closed guard in place, dissolution mode live, and a real ≥15-round read on whether it beats momentum's losing record.**

---

## Note on the other open lever
`docs/DEPLOYABLE_TEST.md` matters **more** under dissolution: if buy-ins can draw from treasury (outcome b), a larger dissolution position → larger reserve claim → much higher PnL. Run that test too once dissolution is live and stable.
