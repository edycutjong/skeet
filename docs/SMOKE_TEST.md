# 🔬 Skeet — Live Testnet Smoke Test

> Goal: confirm Skeet lands **one real buy → exit cycle on-chain** and records `entered=1`.
> Current blocker: `decide()` returns BUY (55× observed) but **rounds entered = 0** → the swap execution path is failing silently. This checklist isolates *why*.

Constants (from `.agent.json` / source — public, safe to share):
```
RPC          http://5.161.35.78:8545   (chainId 42069)
USDC         0xed38c197b319fdc067f4c3fb58eec1a733a36cf4
EOA (signer) 0x6103a75989900Ba592Ef18eC899fF3b646DD766B
tradingSafe  0x06b82e068cf1ba5883cd6c866a62391212e18a1d
treasurySafe 0x2a00fb1b96a7ecf2b3d74f456325ffbd6b078bdc
rolesMod     0x565958705d23849ba4602ce01e64a871e55c9942
```

---

## Phase 0 — Pre-flight (run BEFORE launching, ~5 min)

### 0.1 Stop any running daemon (so logs are clean)
```bash
pkill -f "src/index.ts"      # kill the background daemon
ps aux | grep "src/index.ts" | grep -v grep   # confirm none left
```

### 0.2 ⚠️ Confirm USDC decimals (the silent-corruption check)
The code formats balances as **18 decimals**. If USDC is really **6**, every bankroll/PnL number is wrong by 1e12.
```bash
cd /Users/edycu/Projects/Hackathon/Skeet
node -e "
const {ethers}=require('ethers');
const p=new ethers.JsonRpcProvider('http://5.161.35.78:8545',42069,{staticNetwork:true});
const u=new ethers.Contract('0xed38c197b319fdc067f4c3fb58eec1a733a36cf4',['function decimals() view returns (uint8)'],p);
u.decimals().then(d=>console.log('USDC decimals =',d)).catch(e=>console.log('ERR',e.message));
"
```
- [ ] **decimals == 18** → code is correct, proceed.
- [ ] **decimals == 6** → 🔴 FIX `feed.ts` `formatUnits(...,18)` → `6` for USDC (token balance may differ — check the battle token's decimals too) **before** trusting any number.

### 0.3 Confirm the Safes are actually funded
```bash
node -e "
const {ethers}=require('ethers');
const p=new ethers.JsonRpcProvider('http://5.161.35.78:8545',42069,{staticNetwork:true});
const u=new ethers.Contract('0xed38c197b319fdc067f4c3fb58eec1a733a36cf4',['function balanceOf(address) view returns (uint256)','function decimals() view returns (uint8)'],p);
(async()=>{
  const d=await u.decimals();
  for(const [n,a] of [['trading','0x06b82e068cf1ba5883cd6c866a62391212e18a1d'],['treasury','0x2a00fb1b96a7ecf2b3d74f456325ffbd6b078bdc']]){
    console.log(n, ethers.formatUnits(await u.balanceOf(a), d), 'USDC');
  }
  console.log('EOA ETH (gas):', ethers.formatEther(await p.getBalance('0x6103a75989900Ba592Ef18eC899fF3b646DD766B')));
})();
"
```
- [ ] trading + treasury USDC ≈ **10,000** total (or whatever your real bankroll is). If both read ~0 with decimals=18, the Safes aren't funded **or** decimals are wrong (see 0.2).
- [ ] EOA ETH **> 0.1** (needed to pay gas for the Roles-modifier txns). If 0, the refill path must succeed first (watch for it in 1.2).

---

## Phase 1 — Launch with visible logs

```bash
cd /Users/edycu/Projects/Hackathon/Skeet
npm start            # runs: node --import tsx src/index.ts  (foreground, logs visible)
```

### 1.1 Boot
- [ ] `[INDEX] Launching Skeet Daemon [skeet-agent-…]` (no fatal error).
- [ ] No `BID_ACCESS_CODE is not defined` (means `.env` is missing the code).

### 1.2 Auth & gas (first new battle)
- [ ] `[FEED] New battle detected: …`
- [ ] **No** `Refill failed: Unauthorized` — if you see it, the JWT isn't being attached (the `getFreshJwt()` fix). USDC is non-refillable; refill is **ETH-gas only** by design.
- [ ] `[FEED] Factory approved successfully` — 🔴 if instead `Approval failed: …`, **stop here**: `tradingApproved` stays false, so every BUY is skipped at `feed.ts:274`. This is the #1 suspect for "55 BUYs / 0 entered." The approval is a Roles-modifier tx — its failure message tells you if it's gas, role permission, or RPC.

---

## Phase 2 — Watch 2–3 full rounds (~10 min)

For each round, confirm the tick log line (`feed.ts:249`) reads sane values:
```
[FEED] Tick t=NN.N | Price: … | Safe: … USDC | Treasury: … USDC | Bankroll: … USDC | Action: …
```

### 2.1 Bankroll reads correctly
- [ ] `Bankroll` ≈ your real total (not `0`, not the fallback `10000` masking zeros). If it's exactly `10000.00` every tick while the Safes are funded, the balance read is silently failing → bankroll is faking the default (`feed.ts:213`). Investigate the `usdcContract.balanceOf` calls / decimals.

### 2.2 Signals & decision
- [ ] `t` advances and resets per battle (uses `game.now - game.mmEndAt` in TRADING).
- [ ] During an up-move you see `Action: BUY`; in chop/down you see `HOLD` (skipping is correct, not a bug).
- Note: volume confirmation is effectively always-true (no volume is fed), so breakout = EMA-cross + price>refPrice only.

### 2.3 🔴 THE KEY TEST — does a BUY actually execute on-chain?
When a tick logs `Action: BUY`, immediately watch for:
- [ ] `[FEED] BUYing NNN USDC worth of …`
- [ ] **No** `[FEED] Trade execution failed: …` right after. **This line is the whole investigation.** If it appears, copy the full error — it reveals the real cause:
  - `... reverted ...` → Roles modifier role/permission or slippage (`minAmountOut: 0` should avoid slippage reverts).
  - `insufficient funds` → EOA out of gas ETH (Phase 0.3).
  - `Swap signature API error 4xx` → JWT/auth on `/skill/swap`.
  - `nonce` → tx queue collision (shouldn't happen; serialized).
- [ ] Confirm on-chain: a new tx appears from the EOA / Roles modifier (block explorer for chain 42069, or re-run the balance script — token balance in trading Safe should go **up**, USDC **down**).

### 2.4 Exit before the cliff
- [ ] If it bought, by `t ≈ 162` you see `[FEED] SELLING ALL … tokens` (the `EXIT_DEADLINE_S` guard) — **never** holding past ~170s.
- [ ] Stop-loss path works too: a `SELL_ALL` if price drops `8%` from entry.

### 2.5 It got recorded
```bash
node -e "const D=require('better-sqlite3');const db=new D('skeet.sqlite');
console.log(db.prepare('SELECT game_id,entered,buy_usdc,exit_t,pnl_usdc FROM rounds ORDER BY ts DESC LIMIT 5').all());"
```
- [ ] At least one round now shows **`entered=1`** with a non-zero `buy_usdc` and an `exit_t`. **This is the pass condition** — it means a real buy→exit cycle completed and logged.

---

## ✅ PASS / ❌ FAIL gate

**PASS** = all true:
- [ ] Approval succeeded (`tradingApproved`).
- [ ] At least one `BUY` executed with **no** "Trade execution failed".
- [ ] On-chain balances moved (USDC↓, token↑ on buy; reversed on sell).
- [ ] A round logged `entered=1` and exited before ~170s.
- [ ] Bankroll/decimals verified correct.

If PASS → **leave it running 24/7** (this is the win condition) and move to README + dashboard URL.
If FAIL → the failing line in 1.2 (approval) or 2.3 (execution) names the exact fix. Do **not** enable the Predator until this passes.

---

## 🛡️ Before unattended 24/7 running
- [ ] Circuit breaker active: `MAX_DAILY_LOSS_USDC = 2000` blocks new BUYs after a 24h loss past that (`feed.ts:254`). Confirm it's sane for your bankroll.
- [ ] Use a process manager so it auto-restarts: `pm2 start "npm start" --name skeet` (then `pm2 logs skeet`).
- [ ] Re-check Safe balances + `entered` count once an hour for the first few hours.
- [ ] Keep `PREDATOR_ENABLED=false` until the core has a stable live track record.
```
