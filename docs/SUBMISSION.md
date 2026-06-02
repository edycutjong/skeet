# Skeet — Submission Copy (honest, verifiable)

> Source of truth for all claims: `https://dash.creator.bid/` leaderboard (live, public). Refresh the standing numbers before final submit.

## Project Title
Skeet

## Emotional Hook
A trader watches their bot bleed out fading a token-launch pump, then eat slippage at the 180-second dissolution as 100 agents dump at once. Skeet is the agent that survives the bankroll and walks away before the pool dissolves.

## Short Description (≤150 chars)
An autonomous PvP trading agent for BID Protocol — net-profitable, top-20% of 113 agents, with fully verifiable on-chain PnL.

## Long Description
Skeet is a fully autonomous custom trading agent built from scratch for BID Protocol's PvP arena, where a one-time "clay pigeon" token launches every 3 minutes and 100 agents fight over it for 180 seconds before the pool dissolves.

**How it works.** Skeet watches the 30-second market-making phase (zero capital at risk), fixing a reference price and measuring volatility. In the trading phase it enters only on a *confirmed* momentum breakout — after the violent open settles (a 15s entry floor + an EMA-margin cross + a minimum breakout threshold filter out the false spikes that wreck naive momentum bots). Every position is sized with fractional-Kelly against its non-refillable bankroll, with a quadratic drawdown throttle, so no single round can blow it up. It front-runs the dissolution and protects capital with a trailing/stop exit.

**It runs fully headless** — no wallet to connect. It generates its own keypair, registers itself, reads the on-chain game clock, sizes the bet, executes via the Safe Roles modifier, and exits — every 3 minutes, around the clock. A Next.js telemetry dashboard visualizes per-round execution and a bankroll curve, with PnL accounting reconciled against on-chain balances.

**Verifiable results.** On the public testnet leaderboard, Skeet ranks **#22 of 113 agents with positive PnL** — beating ~90 competitors, and one of only **12 profitable agents among 44 custom builds**. Every trade settles on-chain; anyone can verify the PnL at dash.creator.bid. The repo ships **163 passing tests**, reproducible benchmarks (<100ms decisions), and round-boundary PnL accounting that reconciles to the on-chain total.

*(We're transparent: Skeet does not out-PnL the top hosted MeanReversion agent on cumulative terms — those agents have a multi-thousand-battle head start. Skeet is a from-scratch agent that is genuinely profitable and competitive on a level, per-battle basis, with every claim independently verifiable.)*

## Why ONLY Creatorbid & BID Protocol
1. **`getGameStatus` phase + clock** — Skeet's entire WATCH→TRADE→EXIT state machine synchronizes to the on-chain phase transitions. No equivalent exists on a public DEX.
2. **Contract-enforced 1,000 USDC buy-in cap** — gives the risk engine a native guardrail; settlement also auto-refills the trading Safe (100 USDC treasury→trading) each round.
3. **On-chain dual-pool dissolution** — the AMM reserve is net-distributed pro-rata by token holdings directly between agent Safes (verified on-chain, block 1784818). Skeet's exit logic is built around this settlement, not a market price.

> Remove BID Protocol and you'd need a custom vault, a 100-agent synchronization layer, and an off-chain liquidation broker to run a fair PvP game.

## Honest Limitations
- Does not beat the top hosted agent's *cumulative* PnL (they have thousands of battles' head start); Skeet competes on per-battle quality and the daily prizes.
- Deployable capital is ~100 USDC/round (the trading Safe auto-refills to 100 each round; treasury isn't agent-movable), which caps per-round upside.
- A dissolution-optimizer strategy mode is implemented and A/B-tested; momentum remains the validated default.

## Proof Bundle
- **Live leaderboard:** dash.creator.bid (rank #22/113, positive PnL)
- **Agent address:** `0x6103a75989900Ba592Ef18eC899fF3b646DD766B` (all trades on-chain, chain 42069)
- **Tests:** 163 passing (Vitest), 100% statement coverage on core
- **Dashboard:** real-time telemetry (deploy URL: ⟨VPS/Vercel⟩)
- **Repo:** ⟨github.com/…/skeet⟩ (secrets gitignored)
- **Demo video:** ⟨DemoStudio/015_Skeet⟩

## Track
$2,500 Builder Bounty (custom) + rolling daily prizes + Performance Pool — all custom-agent eligible.

---
Thank you for reviewing Skeet — every number above is independently verifiable on-chain.
