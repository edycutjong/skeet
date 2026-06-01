import { Action, GameContext, AgentConfig } from './types.js';
import { Signals } from './signals.js';
import { kellySize } from './risk.js';

/**
 * Clock-driven state machine to make trading decisions.
 * Pure function with no side effects or I/O.
 */
export function decide(
  ctx: GameContext,
  stats: Signals,
  config: AgentConfig,
  winRate: number = 0.55, // default win rate if no database history exists yet
  predatorAction?: "BUY" | "SELL" | "HOLD"
): Action {
  const { phase, t, price, position, entryPrice, bankroll, peakBankroll } = ctx;

  // 1. WATCH PHASE (Market Making, 0-30s): observe and update stats
  if (phase === "MARKET_MAKING") {
    return { type: "HOLD" };
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
    if (config.PREDATOR_ENABLED && predatorAction && predatorAction !== "HOLD") {
      if (position <= 0 && predatorAction === "BUY" && t < config.ENTRY_DEADLINE_S) {
        const size = kellySize(winRate, bankroll, peakBankroll, config);
        if (size > config.MIN_SIZE_USDC) {
          return { type: "BUY", amount: Math.min(size, config.MAX_BUYIN_USDC) };
        }
      }
      if (position > 0 && predatorAction === "SELL") {
        return { type: "SELL_ALL" };
      }
    }

    // Standard momentum breakout entry window: look for breakout when no open position
    if (position <= 0 && t < config.ENTRY_DEADLINE_S) {
      const emaFast = stats.getEmaFast();
      const emaSlow = stats.getEmaSlow();
      const refPrice = stats.getReferencePrice();
      const volumeRising = stats.isVolumeRising();

      // Breakout conditions: fast EMA > slow EMA, price above MM reference price, volume rising
      const breakout = emaFast > emaSlow && price > refPrice && volumeRising;
      
      if (breakout) {
        const size = kellySize(winRate, bankroll, peakBankroll, config);
        
        if (size > config.MIN_SIZE_USDC) {
          return { type: "BUY", amount: Math.min(size, config.MAX_BUYIN_USDC) };
        }
      }
    }

    // Partial exit on local momentum reversal (trim 25%)
    if (position > 0) {
      if (stats.isReversalDetected()) {
        return { type: "SELL_PARTIAL", amount: 0.25 };
      }
    }
  }

  // Default behavior is to hold
  return { type: "HOLD" };
}

