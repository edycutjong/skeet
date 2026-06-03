import { Action, GameContext, AgentConfig } from "./types.js";
import { Signals } from "./signals.js";
import { kellySize } from "./risk.js";

/**
 * Clock-driven state machine to make trading decisions.
 * Pure function with no side effects or I/O.
 */
export function decide(
  ctx: GameContext,
  stats: Signals,
  config: AgentConfig,
  winRate: number = 0.55, // default win rate if no database history exists yet
  predatorAction?: "BUY" | "SELL" | "HOLD",
): Action {
  const { phase, t, price, position, entryPrice, bankroll, peakBankroll } = ctx;
  const warmupTicks =
    config.WARMUP_TICKS !== undefined ? config.WARMUP_TICKS : 8;
  const minBreakoutPct =
    config.MIN_BREAKOUT_PCT !== undefined ? config.MIN_BREAKOUT_PCT : 0.015;
  const reversalTrailPct =
    config.REVERSAL_TRAIL_PCT !== undefined ? config.REVERSAL_TRAIL_PCT : -0.06;
  const entryMinT = config.ENTRY_MIN_T !== undefined ? config.ENTRY_MIN_T : 15;
  const emaMargin = config.EMA_MARGIN !== undefined ? config.EMA_MARGIN : 0.004;

  // 1. WATCH PHASE (Market Making, 0-30s): observe and update stats
  if (phase === "MARKET_MAKING") {
    return { type: "HOLD" };
  }

  const mode = config.STRATEGY_MODE ?? "momentum";
  if (mode === "dissolution") {
    return decideDissolution(ctx, stats, config);
  }

  // 2. EXIT PHASE: dissolution frontrun
  // If we are in TRADING phase and have reached or exceeded the exit deadline
  if (phase === "TRADING" && t >= config.EXIT_DEADLINE_S) {
    if (position > 0) {
      return { type: "SELL_ALL" };
    }
    return { type: "HOLD" };
  }

  // 3. TRADING PHASE: buy / sell / stop-loss / reversal exits
  if (phase === "TRADING") {
    // Hard stop-loss guard first
    if (position > 0 && entryPrice > 0) {
      const drawdown = (price - entryPrice) / entryPrice;
      if (drawdown <= config.STOP_LOSS_PCT) {
        return { type: "SELL_ALL" };
      }
    }

    // Predator-override logic: if enabled, predator triggers override momentum checks
    if (
      config.PREDATOR_ENABLED &&
      predatorAction &&
      predatorAction !== "HOLD"
    ) {
      if (
        position <= 0 &&
        predatorAction === "BUY" &&
        t >= entryMinT &&
        t < config.ENTRY_DEADLINE_S &&
        stats.getTickCount() >= warmupTicks
      ) {
        const size = kellySize(winRate, bankroll, peakBankroll, config);
        const deployable = ctx.deployable !== undefined ? ctx.deployable : 0;
        const amount = Math.min(size, config.MAX_BUYIN_USDC, deployable);
        if (amount >= config.MIN_SIZE_USDC) {
          return { type: "BUY", amount };
        }
      }
      if (position > 0 && predatorAction === "SELL") {
        return { type: "SELL_ALL" };
      }
    }

    // Standard momentum breakout entry window: look for breakout when no open position
    if (position <= 0 && t >= entryMinT && t < config.ENTRY_DEADLINE_S) {
      const emaFast = stats.getEmaFast();
      const emaSlow = stats.getEmaSlow();
      const refPrice = stats.getReferencePrice();
      const volumeRising = stats.isVolumeRising();

      const ready = stats.getTickCount() >= warmupTicks;
      // Breakout conditions: fast EMA > slow EMA * (1 + emaMargin), price above MM reference price by MIN_BREAKOUT_PCT, volume rising, and engine warmed up
      const breakout =
        ready &&
        emaFast > emaSlow * (1 + emaMargin) &&
        price > refPrice * (1 + minBreakoutPct) &&
        volumeRising;

      if (breakout) {
        const size = kellySize(winRate, bankroll, peakBankroll, config);
        const deployable = ctx.deployable !== undefined ? ctx.deployable : 0;
        const amount = Math.min(size, config.MAX_BUYIN_USDC, deployable);
        if (amount >= config.MIN_SIZE_USDC) {
          return { type: "BUY", amount };
        }
      }
    }

    // Partial exit on local momentum reversal (trim 25%)
    if (position > 0) {
      if (stats.isReversalDetected(reversalTrailPct)) {
        return { type: "SELL_PARTIAL", amount: 0.25 };
      }
    }
  }

  // Default behavior is to hold
  return { type: "HOLD" };
}

function decideDissolution(
  ctx: GameContext,
  stats: Signals,
  config: AgentConfig,
): Action {
  const { phase, t, price, position, reserves } = ctx;
  if (phase !== "TRADING") return { type: "HOLD" };

  const accumT = config.DISSO_ACCUMULATE_T ?? 150;
  const crashPct = config.DISSO_MIN_CRASH_PCT ?? -0.4;
  const cap = config.DISSO_MAX_BUYIN_USDC ?? 200;
  const ref = stats.getReferencePrice();
  const drawdown = ref > 0 ? (price - ref) / ref : 0;

  // 1. Stay flat (USDC) for the whole pump-and-dump.
  if (t < accumT) return { type: "HOLD" };

  // 2. Late window: accumulate ONLY if the token has crashed (cheap tokens, herd has dumped)
  //    and the pool still holds a meaningful USDC reserve worth claiming.
  if (position <= 0 && drawdown <= crashPct && reserves > cap) {
    const deployable = ctx.deployable !== undefined ? ctx.deployable : 0;
    const amount = Math.min(cap, deployable);
    if (amount >= (config.MIN_SIZE_USDC ?? 50)) {
      return { type: "BUY", amount };
    }
  }

  // 3. HOLD tokens THROUGH dissolution — do NOT exit. (the whole point)
  return { type: "HOLD" };
}
