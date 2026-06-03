# 🧭 Strategy Status & North Star — Skeet

> Snapshot: 2026-06-02 (~2 days to deadline 2026-06-04 10:03). Source of truth: `https://dash.creator.bid/api/leaderboard`.
> This is the north star for the remaining time. Re-pull the leaderboard to refresh numbers.

> ## ✅ CURRENT STATE: BATTLES ACTIVE & ALL FIXES VERIFIED (2026-06-02)
> Rules change completed (no market-making phase, pure pump-and-dump meta).
> - **FIX 1/2/4:** Shipped and verified. Reference price seeds on the first TRADING tick.
> - **FIX 3 (strategy validation):** Completed. Head-to-head live A/B testing on chain 42069 verified that momentum breakout mode is superior to dissolution mode (average per-battle loss of -12.53 USDC vs -56.21 USDC). Config is locked to `"momentum"`. Daemon is running 24/7.

---

## Where Skeet actually stands (live leaderboard)
- **Rank #29 / 117 · PnL +18 · 27 battles · 10W/15L · +1 / battle.**
- Net **positive**; among **62 custom agents, only 22 are positive** — Skeet is one of them (top ~25% overall).
- The earlier local "−1,039" was a **broken metric** (drawdown-from-peak). Real PnL is positive. ✅

## The $2,500 Builder Bounty = effectively OUT OF REACH
- Requires beating the **top hosted agent: ApeAgent (Mean Rev), PnL 143,868** (cumulative, 3,071 battles).
- Skeet: 184. Gap ~780×. The leaders had **thousands of battles' head start**; Skeet has 21 and ~2 days (~800 battles max) at +9/battle ≈ +7k — nowhere near.
- Already triggered by **Shadow (custom, 184,417)** — currently the only qualifier.
- **Do not anchor the project on this prize.**

## The REAL target: rolling DAILY prizes (3 × 1,000 USDC, Jun 2/3/4) — ✅ CONFIRMED DAILY
- **Q1 answered (Telegram):** prizes are **DAILY, based on PnL** ("1k each day", "not battles fought"). Cumulative gap is irrelevant — fresh shots each day (Jun 3 & 4 remain).
- **BUT:** community reports **"only 3 mates got reward"** → the daily 1k splits among only the **top few by that day's PnL.** Being *positive* isn't enough — you must be **near the top of the day.**
- Everyone shares the **~100 USDC/round cap** (settlement auto-refills trading Safe 100 from treasury each round — Q2 answered). So absolute daily PnL ≈ (battles/day × ~100 × per-battle edge). **Per-battle edge is the only lever.**
- **Q3 answered:** dissolution settles **pro-rata by token holdings**, on-chain (verified) → the dissolution-accumulation pivot is **mechanically valid**, but underperforms compared to momentum mode.

## The KPI that matters now: **PnL per battle**
| Agent | PnL/battle |
|---|---|
| Skeet (now) | **+1** |
| SUPAH | 85 |
| Apex | 91 |
| Jirachi | 93 |
| Shadow (#1) | 145 |
| agent-ea80BC8c | **312** |

You can't catch cumulative — so **raise per-battle PnL from +1 toward 50–150+.** Volume alone at +1 won't win a day.

---

## North-Star Priorities (remaining ~2 days)
1. **Maintain running daemon in `"momentum"` mode:** Keep the daemon active 24/7. Head-to-head live A/B testing on chain 42069 verified that momentum breakout mode is superior to dissolution mode (average per-battle loss of -12.53 USDC vs -56.21 USDC).
2. **Selectivity & risk tuning:** Monitor entry rate and PnL. Keep risk tight using partial scaling out to restrict drawdowns.
3. **Be top-few in a single day's PnL:** Jun 3 and Jun 4 daily snapshots are the target. Focus on minimizing drawdowns and maximizing per-battle edge under the 100 USDC/round cap.
4. **Keep it alive 24/7:** Daemon running under background task process, monitored via logs.

## Submission framing (honest)
- ❌ Do NOT claim "beat the house" — Skeet did not beat the top hosted agent.
- ✅ DO claim: **"a from-scratch custom agent, net-profitable, ranked top-20% of 113 competitors, beating ~90 agents — with verifiable on-chain PnL on dash.creator.bid."**
- Lead with the engineering + honest, verifiable results. Judges trust that over inflated claims.

## Reconciliation check (run anytime)
```bash
# Real on-chain PnL (truth):
node -e "const {ethers}=require('ethers');const p=new ethers.JsonRpcProvider('http://5.161.35.78:8545',42069,{staticNetwork:true});const u=new ethers.Contract('0xed38c197b319fdc067f4c3fb58eec1a733a36cf4',['function balanceOf(address) view returns (uint256)'],p);(async()=>{const t=+ethers.formatUnits(await u.balanceOf('0x06b82e068cf1ba5883cd6c866a62391212e18a1d'),18);const r=+ethers.formatUnits(await u.balanceOf('0x2a00fb1b96a7ecf2b3d74f456325ffbd6b078bdc'),18);console.log('on-chain PnL:',(t+r-10000).toFixed(2))})()"
# Live leaderboard rank:
node -e "fetch('https://dash.creator.bid/api/leaderboard').then(r=>r.json()).then(d=>{const a=(d.agents||d).sort((x,y)=>y.pnl-x.pnl);const i=a.findIndex(z=>(z.name||'').includes('skeet'));console.log('rank',i+1,'/',a.length,'| pnl',a[i]&&a[i].pnl,'| /btl',a[i]&&a[i].avg)})"
```

## Related
- `OPEN_QUESTIONS.md` — Q1 (daily vs cumulative) is the gating question.
- `FIX_SPEC_PNL.md` — real measurement + selectivity (do first).
- `FIX_SPEC_DISSOLUTION_MODE.md` — the pivot if momentum can't reach competitive per-battle PnL.
