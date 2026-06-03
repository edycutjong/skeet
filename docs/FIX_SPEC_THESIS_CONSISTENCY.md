# 🔧 Fix Spec — Thesis & Doc Consistency (post-dissolution pivot)

> For whoever drives the agent. Companion to `FIX_SPEC_SAFETY_AND_MODE.md`.
> That spec flips the **strategy**; this one closes the gaps it leaves behind: a missing
> regression test, an API-name mismatch, and the **stale "front-run the dissolution / beat the
> slippage cliff" story** that still lives in the README and submission copy after we confirmed
> on-chain (OPEN_QUESTIONS Q3) that the winning play is to **HOLD tokens THROUGH dissolution**
> for a pro-rata reserve claim — the *opposite* of front-running it.
>
> **Do `FIX_SPEC_SAFETY_AND_MODE.md` first.** None of the below changes strategy; they make the
> repo say what the code actually does.

---

## Status check (already done — just verify, don't redo)
- ✅ **FIX 1 (fail-closed `deployable`) is already in `src/decide.ts`** — lines 70, 99, 139 all use
  `ctx.deployable !== undefined ? ctx.deployable : 0`. The `: Infinity` described in
  `FIX_SPEC_SAFETY_AND_MODE.md` is no longer in the code. Confirm with:
  ```bash
  grep -n "deployable !== undefined" src/decide.ts   # expect three hits, all ": 0"
  ```
- ✅ Dissolution mode already bypasses the 162s force-exit: `decide()` routes to
  `decideDissolution()` (decide.ts:32-34) **before** the `t >= EXIT_DEADLINE_S` SELL_ALL branch
  (decide.ts:38), and `decideDissolution` step 3 returns HOLD. The hold-through thesis is
  correctly coded. **FIX A below just locks it with a test.**
- ⛔ **FIX 2 (`STRATEGY_MODE: "dissolution"`) is NOT applied** — `src/config.json` still says
  `"momentum"`. That stays the job of `FIX_SPEC_SAFETY_AND_MODE.md`.

---

## FIX A (test) — lock the "hold through dissolution" guarantee

**Problem:** Nothing fails if someone later edits `decide()` and the `t >= EXIT_DEADLINE_S`
SELL_ALL branch starts catching dissolution mode. The entire pivot dies silently — the agent
would dump tokens at 162s instead of holding for the reserve claim. Current tests cover
dissolution routing (`decide.test.ts:548`), late-crash buy (`:574`), and fail-closed (`:603`),
but **none asserts "no exit at/after the deadline."**

**Change (`test/decide.test.ts`):** add a test in the dissolution block.
```ts
test("Dissolution mode does NOT force-exit at/after EXIT_DEADLINE_S (holds through)", () => {
  const cfg = { ...mockConfig, STRATEGY_MODE: "dissolution" } as AgentConfig;
  const ctx: GameContext = {
    ...baseCtx,                       // match the shape used by neighbouring dissolution tests
    phase: "TRADING",
    t: cfg.EXIT_DEADLINE_S + 10,      // past the momentum-mode exit deadline
    position: 500,                    // holding tokens
    reserves: 5000,
    deployable: 10000,
  };
  const action = decide(ctx, stats, cfg);
  expect(action.type).toBe("HOLD");   // must NOT be SELL_ALL
});
```
(Adjust `baseCtx`/`stats` to whatever the existing dissolution tests construct.)

**Verify:** `npm test` green; this test fails if the dissolution-before-deadline routing is ever broken.

---

## FIX B (test) — fail-closed must be proven on the **momentum** branch too

**Problem:** `FIX_SPEC_SAFETY_AND_MODE.md` asked for the fail-closed test in **both** modes. Only
the dissolution case is covered (`decide.test.ts:603`). The momentum branch (decide.ts:99) needs
the same assertion.

**Change (`test/decide.test.ts`):** momentum mode, all breakout conditions true, `deployable`
undefined → expect `HOLD` (not a BUY at `MAX_BUYIN_USDC`).

**Verify:** `npm test` green.

---

## FIX C (docs) — README still sells the *old* thesis

`grep -niE "front-run|frontrun|slippage|bypass" README.md` → lines **36, 40**. These describe the
abandoned "front-run the dissolution / beat the AMM slippage" edge, which contradicts the
hold-through play and the honest framing already in `docs/SUBMISSION.md` + `docs/STRATEGY_STATUS.md`.

**Change:**
- **README.md:36** — `"...autonomously front-running liquidity dissolutions and continuously optimizing trade execution."`
  → reframe to the real edge, e.g. *"...by reading the on-chain game clock and capturing the
  dissolution reserve split that naive momentum bots miss."*
- **README.md:40** — `"...execute precisely at second 162s to bypass AMM liquidation slippage."`
  The 162s exit only applies to **momentum mode**; dissolution mode deliberately holds to
  dissolution. Reword so it doesn't claim a universal "exit at 162s to dodge slippage" (the
  dissolution settlement is a slippage-free pro-rata redemption — there is no cliff to dodge).

**Verify:** `grep -niE "front-run|frontrun|bypass.*slippage" README.md` returns nothing.

---

## FIX D (docs) — `docs/SUBMISSION.md` contradicts itself + unsupported "stampede" hook

**Problem:**
- **Line 17** says *"It front-runs the dissolution and protects capital with a trailing/stop exit"*
  — directly contradicts line 28 (*"exit logic is built around this settlement, not a market
  price"*) and the Q3-confirmed hold-through mechanic.
- **Line 9** (emotional hook) leans on *"eat slippage at the 180-second dissolution as 100 agents
  dump at once... walks away before the pool dissolves."* Per Q3, dissolution is a **pro-rata
  redemption by token holdings**, not a sell-into-the-curve stampede — so "100 agents dump / eat
  slippage / walk away before it dissolves" isn't what the protocol does. It's a vivid hook built
  on a mechanic that doesn't exist.

**Change:**
- **Line 17** — drop "front-runs the dissolution"; describe what the agent actually does per mode
  (momentum: trailing/stop exit before deadline; dissolution: holds through for the pro-rata
  reserve claim).
- **Line 9** — keep the hook's *emotion* but anchor it to a real failure mode (e.g. naive bots
  fading the pump and bleeding out / mis-timing the capped buy-in), not a dissolution slippage
  stampede.

**Verify:** `grep -niE "front-run|frontrun|dump at once|walks away before" docs/SUBMISSION.md`
returns nothing; the doc no longer asserts a dissolution slippage cliff.

---

## FIX E (docs) — pin down the game-clock API name (one truth)

**Problem:** the protocol clock is named **three** ways across the repo and none is grounded in
the scraped source docs (`sites/bid-protocol/clean/dev_resources.md` has **no API reference**):
- `docs/SUBMISSION.md:26` → **`getGameStatus`**
- `README.md:77` → **`GET /api/game`**
- HermesDocs corpus → `getGameStatus`

**Change:** check what the agent actually calls.
```bash
grep -rniE "getGameStatus|/api/game|game.?status|phase" src/feed.ts src/index.ts
```
Use that **one real name** everywhere. If the real call differs from both, fix both docs. If
you can't verify the exact name, soften to *"the on-chain game clock / phase feed"* rather than
naming a function that may not exist.

**Verify:** every doc references the same, real identifier.

---

## FIX F (docs) — decide the fate of the stale HermesDocs corpus

**Problem:** the planning corpus in
`../HermesDocs/dorahacks-bid-protocol-2026/` (`PRD.md`, `ARCHITECTURE.md`, `SUBMISSION.md`,
`DORAHACKS_BUIDL.md`) still sells the **superseded** thesis: momentum-beats-mean-reversion +
front-run-exit + fractional-Kelly on a *non-refillable 10,000* bankroll. Reality (per
`STRATEGY_STATUS.md` + Q1/Q2/Q3): momentum lost live, buy-ins are **~100 USDC/round auto-refilled**
(not a 10k stake), and dissolution-hold is the validated edge. Specific landmines if submitted:
- `DORAHACKS_BUIDL.md:41` — *"fully liquidates... around second 99 — ~80 seconds before the 180s
  dissolution"* — contradicts both the 162s in every other doc **and** the hold-through pivot.
- `DORAHACKS_BUIDL.md:43` — the **`+2,583 USDC vs −1,397`** backtest stat is unsourced and not
  reproducible from this repo; the doc itself flags it for replacement.

**Change — pick one (do NOT submit both corpora):**
- **(a) Canonical = `Skeet/docs/`** (recommended): the `docs/` SUBMISSION/STRATEGY copies are the
  honest, on-chain-reconciled source of truth. Add a one-line banner to each stale HermesDocs file
  — *"⚠️ SUPERSEDED — see Skeet/docs/SUBMISSION.md. Pre-pivot planning artifact."* — and submit
  only from `Skeet/docs/`.
- **(b) Reconcile HermesDocs** to the dissolution/per-battle/honest framing (mirror
  `docs/SUBMISSION.md`), fix the `second 99` line, and replace `+2,583` with the **live**
  leaderboard number before submit.

**Verify:** whichever you keep, `grep -rniE "second 99|2,583|non-refillable.*10,000|beat the house"`
across the *canonical* set is clean (or clearly framed as honest limitation).

---

## VERIFICATION (all of the above)
1. `npm test` green (incl. FIX A + FIX B); `npm run typecheck` clean.
2. Canonical-doc grep is clean:
   ```bash
   grep -rniE "front-run|frontrun|bypass.*slippage|second 99|2,583" README.md docs/SUBMISSION.md docs/STRATEGY_STATUS.md
   ```
   → no hits (or only inside an explicit "honest limitation" sentence).
3. One game-clock API name used everywhere (FIX E).
4. Exactly one canonical submission corpus; the other is banner-marked superseded (FIX F).

**Done = the repo's story matches the code and the on-chain reality: hold-through-dissolution for
the reserve claim, ~100/round capped buy-in, honest top-20% / per-battle framing — with no surviving
"front-run the slippage cliff" or "beat the house" claims outside an explicit limitations note.**
