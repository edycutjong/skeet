import { describe, test, expect, beforeEach } from 'vitest';
import { decide } from '../src/decide.js';
import { Signals } from '../src/signals.js';
import { AgentConfig, GameContext } from '../src/types.js';

const mockConfig: AgentConfig = {
  EMA_FAST: 5,
  EMA_SLOW: 20,
  ENTRY_DEADLINE_S: 90,
  EXIT_DEADLINE_S: 162,
  STOP_LOSS_PCT: -0.08,
  KELLY_FRACTION: 0.5,
  MAX_BUYIN_USDC: 1000,
  START_BANKROLL: 10000,
  DRAWDOWN_FLOOR_PCT: 0.30,
  MIN_SIZE_USDC: 50,
  PREDATOR_ENABLED: false
};

describe('Core decide state machine tests', () => {
  let stats: Signals;

  beforeEach(() => {
    stats = new Signals(mockConfig.EMA_FAST, mockConfig.EMA_SLOW);
  });

  // WATCH Phase
  test('Always returns HOLD in MARKET_MAKING phase', () => {
    const ctx: GameContext = {
      phase: "MARKET_MAKING",
      t: 15,
      price: 100,
      reserves: 50000,
      position: 0,
      entryPrice: 0,
      bankroll: 10000,
      peakBankroll: 10000
    };

    const action = decide(ctx, stats, mockConfig);
    expect(action.type).toBe("HOLD");
  });

  // EXIT Phase: Exit guarantee test (never holds past EXIT_DEADLINE_S)
  test('Forced SELL_ALL exit at or after EXIT_DEADLINE_S when holding', () => {
    const ctx: GameContext = {
      phase: "TRADING",
      t: mockConfig.EXIT_DEADLINE_S,
      price: 100,
      reserves: 50000,
      position: 10,
      entryPrice: 90,
      bankroll: 10000,
      peakBankroll: 10000
    };

    const action = decide(ctx, stats, mockConfig);
    expect(action.type).toBe("SELL_ALL");

    // After deadline, but not holding position
    ctx.position = 0;
    const action2 = decide(ctx, stats, mockConfig);
    expect(action2.type).toBe("HOLD");
  });

  // Stop loss guard tests
  test('Stop loss trigger when drawdown exceeds STOP_LOSS_PCT', () => {
    // 9% drop, stop loss is -8%
    const ctx: GameContext = {
      phase: "TRADING",
      t: 40,
      price: 91,
      reserves: 50000,
      position: 10,
      entryPrice: 100,
      bankroll: 10000,
      peakBankroll: 10000
    };

    const action = decide(ctx, stats, mockConfig);
    expect(action.type).toBe("SELL_ALL");

    // 7% drop -> HOLD
    ctx.price = 93;
    const action2 = decide(ctx, stats, mockConfig);
    expect(action2.type).toBe("HOLD");
  });

  // Entry Signal Tests
  test('Buy entry triggers on confirmed breakout', () => {
    const ctx: GameContext = {
      phase: "TRADING",
      t: 20,
      price: 110,
      reserves: 50000,
      position: 0,
      entryPrice: 0,
      bankroll: 10000,
      peakBankroll: 10000
    };

    // Setup stats for breakout: Fast EMA > Slow EMA, Price > RefPrice, Volume rising
    stats.setReferencePrice(100);
    stats.update(100, 10);
    stats.update(102, 12);
    stats.update(105, 15);
    stats.update(108, 18);
    stats.update(110, 20); // current tick

    const action = decide(ctx, stats, mockConfig, 0.60);
    expect(action.type).toBe("BUY");
    expect(action.amount).toBeGreaterThan(0);
    expect(action.amount).toBeLessThanOrEqual(mockConfig.MAX_BUYIN_USDC);
  });

  test('Skip round if beyond entry deadline', () => {
    const ctx: GameContext = {
      phase: "TRADING",
      t: mockConfig.ENTRY_DEADLINE_S + 5, // past deadline
      price: 110,
      reserves: 50000,
      position: 0,
      entryPrice: 0,
      bankroll: 10000,
      peakBankroll: 10000
    };

    stats.setReferencePrice(100);
    stats.update(100, 10);
    stats.update(110, 20);

    const action = decide(ctx, stats, mockConfig);
    expect(action.type).toBe("HOLD"); // skipped
  });

  // Reversal Trim Tests
  test('Partial exit on momentum reversal', () => {
    const ctx: GameContext = {
      phase: "TRADING",
      t: 50,
      price: 96, // 4% drop from peak (100)
      reserves: 50000,
      position: 10,
      entryPrice: 90,
      bankroll: 10000,
      peakBankroll: 10000
    };

    stats.setReferencePrice(80);
    stats.update(90);
    stats.update(100); // peak
    stats.resetPeakPrice(); // set peak
    stats.update(96); // drop

    const action = decide(ctx, stats, mockConfig);
    expect(action.type).toBe("SELL_PARTIAL");
    expect(action.amount).toBe(0.25);
  });

  // Generative parameterized check for multiple time steps to verify exit guarantee
  const tExitCases = Array.from({ length: 50 }, (_, i) => mockConfig.EXIT_DEADLINE_S + i);
  test.each(tExitCases)('Exit guarantee holds for t=%i', (tVal) => {
    const ctx: GameContext = {
      phase: "TRADING",
      t: tVal,
      price: 120,
      reserves: 50000,
      position: 1,
      entryPrice: 100,
      bankroll: 10000,
      peakBankroll: 10000
    };
    const action = decide(ctx, stats, mockConfig);
    expect(action.type).toBe("SELL_ALL");
  });
});
