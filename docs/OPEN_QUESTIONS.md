# ❓ Open Questions — BID Protocol (awaiting answers)

> Asked in the Creatorbid Telegram. Record answers here as they come in so they don't get lost in the scroll.
> Leaderboard / dashboard: **https://dash.creator.bid/**

---

## Q1 — Prize structure: daily vs cumulative PnL  ✅ ANSWERED
**Question asked:** Regarding the rolling prizes (3 × 1,000 USDC on June 2 / 3 / 4) — is the pro-rata distribution based on **daily PnL** or **cumulative PnL**?

**Answer (Telegram, 2026-06-02):** **DAILY — "1k each day", based on PnL (not battles fought)** (Lateef + Mod Albert: "It's based on PNL not battles fought"; "The goal was to make profits and climb the leaderboard"). Community notes **"only 3 mates got reward"** → the daily 1k splits among only the **top few** by that day's PnL.

**Implication:** each day (Jun 2/3/4) is a fresh contest — but you must be near the **TOP** of daily PnL to get a slice, not just positive. With the ~100/round cap on everyone, **per-battle edge is the only lever.** Skeet at +9/battle is far below the leaders (85–261) → not top-3 yet. Winning a day = dramatically raise per-battle PnL (selectivity + dissolution pivot).

---

## ⛔ BATTLES PAUSED (2026-06-02)  — devs "rolling out changes"
Mod Albert confirmed (~01:53 onward): **"Yes they are, we are rolling out some changes."** Paused 1hr+ with no ETA ("I will keep you guys updated / Not yet"). Another participant (Layr) reports the same **"no entry even though settings complete, UI flashing"** issue.

**Critical implications:**
- **Skeet's recent "0 entries / no on-chain movement" is now AMBIGUOUS** — it may be the pause, not over-selectivity. **Do NOT loosen `ENTRY_MIN_T` based on paused-period data.** Re-measure only after battles resume.
- The "changes" may alter rules / prize structure / reset the leaderboard (fairness complaints about only 3 winners). Don't over-commit assumptions until they announce.
- **Use the downtime to ship the dissolution pivot + tuning** so Skeet is stronger when battles resume (a competitor literally said the pause "gives you time to build a strategy").

---

## Q2 — Trading-Safe funding (unblocks bet size)  ⏳ NOT YET ASKED / WAITING
**Question to ask:**
> "After registering a custom agent, the trading Safe has 100 USDC and the treasury Safe has 9,900. Is the trading Safe auto-funded from the treasury at buy-in, or do I transfer it myself? And does the Roles modifier allow moving USDC from treasury → trading Safe?"

**Why it matters:**
- Skeet currently can only deploy ~100 USDC/game (trading-Safe balance). The rules allow up to **1,000/game**.
- **If treasury → trading transfer is allowed** → implement the "Optional Enhancement" in `FIX_SPEC_FUNDING.md` to top up and bet bigger (much easier to out-earn the house).
- **If not allowed** → ~100/game is the hard ceiling; the Primary Fix is the whole fix.

**Answer:** _(paste here when received)_

---

---

## Q3 — Dissolution Formula & Settle Verification (Step 0 Findings)  ✅ CONFIRMED ON-CHAIN
**Findings from scanning block 1784818 & pool contracts:**
- **Pool Type:** The pool contracts deployed for each game are standard **Uniswap V3 Pools** (factory: `0xAA51ABf9dA9F8d9397c4076BEfa52FcD8b117457`, pool implementation: `0xB2d4430b773AE7d7267d4a0614027211daEc1E0A`). They do not contain any custom dissolution code.
- **Settlement Execution:** Payout is orchestrated by the **Creatorbid Game Round contract proxy** (e.g., `0x04176D884842e9126e1a1D73950F281d29e6a3e3`, implementation: `0xd973E5f5a502d1edA6B63285Cb265614a784A53d`). At T=180, the game round contract pulls the remaining assets from the Uniswap V3 pool and runs a netting settlement algorithm.
- **Asset Distribution:** The game contract uses Gnosis Safe role-modifier-scoped authority to execute direct USDC transfers from losing agents' Safes to winning agents' Safes (or vice-versa), optimizing the transfer path.
- **Refill Mechanism:** After a round settles, the settlement transaction triggers a transfer of 100 USDC from the agent's treasury Safe to the trading Safe (observed as Transfer 42 in block 1784818: `0x2a00f...` to `0x06b82...`) to reset the trading Safe's deployable capital for the next round.
- **Verification:** Since the settlement net-distributes remaining reserves pro-rata based on token holdings directly to agent Safes on-chain, **the late-stage cheap token accumulation thesis is mathematically valid.**

---

## Known facts (already confirmed)
- Prize pool: **$2,500 Builder Bounty** (custom agents beating the top hosted agent, pro-rata) **+ 3 × 1,000 USDC rolling daily prizes (June 2/3/4)** + Performance Pool.
- Bankroll: **10,000 USDC**, non-refillable. Split observed on-chain: **trading Safe 100 / treasury Safe 9,900**.
- Max buy-in: **1,000 USDC/game** (contract-enforced).
- Chain 42069, RPC `http://5.161.35.78:8545`, USDC 18 decimals.
- Deadline: **2026-06-04 10:03**.

## Related docs
- `docs/FIX_SPEC_FUNDING.md` — the fix (Q2's answer decides whether to add the Optional Enhancement)
- `SMOKE_TEST.md` — verify the first real trade lands
