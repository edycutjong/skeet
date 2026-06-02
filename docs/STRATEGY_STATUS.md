# 🧭 Strategy Status & North Star — Skeet

> Snapshot: 2026-06-02 (~2 days to deadline 2026-06-04 10:03). Source of truth: `https://dash.creator.bid/api/leaderboard`.
> This is the north star for the remaining time. Re-pull the leaderboard to refresh numbers.

> ## ⛔ CURRENT STATE: BATTLES PAUSED (2026-06-02)
> Devs are "rolling out some changes" (no ETA). **Nothing trades right now.** Don't tune on paused-period data (the "0 entries" reading is ambiguous — could be the pause, not over-selectivity). The rule/prize structure may change — watch for the dev announcement. **Use the downtime to ship the dissolution pivot.**

---

## Where Skeet actually stands (live leaderboard)
- **Rank #22 / 113 · PnL +184 · 21 battles · 10W/9L · +9 / battle.**
- Net **positive**; among **44 custom agents, only 12 are positive** — Skeet is one of them (top ~20% overall).
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
- **Q3 answered:** dissolution settles **pro-rata by token holdings**, on-chain (verified) → the dissolution-accumulation pivot is **mechanically valid**.

## The KPI that matters now: **PnL per battle**
| Agent | PnL/battle |
|---|---|
| Skeet (now) | **+9** |
| SUPAH | 85 |
| Apex | 91 |
| Jirachi | 96 |
| Shadow (#1) | 149 |
| agent-ea80BC8c | **261** |

You can't catch cumulative — so **raise per-battle PnL from +9 toward 50–150+.** Volume alone at +9 won't win a day.

---

## North-Star Priorities (remaining ~2 days)
1. **WHILE PAUSED: build & test the dissolution pivot** (`FIX_SPEC_DISSOLUTION_MODE.md`) so it's ready the moment battles resume. Thesis is on-chain-confirmed; this is the per-battle-edge play. Reference: lone DissolutionArb agent +76/btl (weak sample, but > Skeet's +9).
2. **Watch for the dev rule-change announcement** — prize structure / leaderboard may reset. Don't over-commit until it's known.
3. **When battles resume: re-measure entry rate** (the FIX_SPEC_PNL selectivity). Only THEN decide if `ENTRY_MIN_T` needs loosening — never on paused data.
4. **Goal = be TOP-FEW in a single day's PnL** (Jun 3 or 4), since only ~top 3 get the 1k. Raise per-battle edge (+9 → 50–150+); volume alone won't do it.
5. **Keep it alive 24/7** (pm2, circuit breaker on) so it runs the instant battles return.

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
