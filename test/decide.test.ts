import { describe, test, expect, beforeEach, vi } from "vitest";
import { decide } from "../src/decide.js";
import { Signals } from "../src/signals.js";
import { AgentConfig, GameContext } from "../src/types.js";

const mockConfig: AgentConfig = {
  EMA_FAST: 5,
  EMA_SLOW: 20,
  ENTRY_DEADLINE_S: 90,
  EXIT_DEADLINE_S: 162,
  STOP_LOSS_PCT: -0.08,
  KELLY_FRACTION: 0.5,
  MAX_BUYIN_USDC: 1000,
  START_BANKROLL: 10000,
  DRAWDOWN_FLOOR_PCT: 0.3,
  MIN_SIZE_USDC: 50,
  PREDATOR_ENABLED: false,
  MAX_DAILY_LOSS_USDC: 2000,
  WARMUP_TICKS: 8,
  MIN_BREAKOUT_PCT: 0.015,
  REVERSAL_TRAIL_PCT: -0.06,
};

describe("Core decide state machine tests", () => {
  let stats: Signals;

  beforeEach(() => {
    stats = new Signals(mockConfig.EMA_FAST, mockConfig.EMA_SLOW);
  });

  // WATCH Phase
  test("Always returns HOLD in MARKET_MAKING phase", () => {
    const ctx: GameContext = {
      phase: "MARKET_MAKING",
      t: 15,
      price: 100,
      reserves: 50000,
      position: 0,
      entryPrice: 0,
      bankroll: 10000,
      peakBankroll: 10000,
      deployable: 10000,
    };

    const action = decide(ctx, stats, mockConfig);
    expect(action.type).toBe("HOLD");
  });

  // EXIT Phase: Exit guarantee test (never holds past EXIT_DEADLINE_S)
  test("Forced SELL_ALL exit at or after EXIT_DEADLINE_S when holding", () => {
    const ctx: GameContext = {
      phase: "TRADING",
      t: mockConfig.EXIT_DEADLINE_S,
      price: 100,
      reserves: 50000,
      position: 10,
      entryPrice: 90,
      bankroll: 10000,
      peakBankroll: 10000,
      deployable: 10000,
    };

    const action = decide(ctx, stats, mockConfig);
    expect(action.type).toBe("SELL_ALL");

    // After deadline, but not holding position
    ctx.position = 0;
    const action2 = decide(ctx, stats, mockConfig);
    expect(action2.type).toBe("HOLD");
  });

  // Stop loss guard tests
  test("Stop loss trigger when drawdown exceeds STOP_LOSS_PCT", () => {
    // 9% drop, stop loss is -8%
    const ctx: GameContext = {
      phase: "TRADING",
      t: 40,
      price: 91,
      reserves: 50000,
      position: 10,
      entryPrice: 100,
      bankroll: 10000,
      peakBankroll: 10000,
      deployable: 10000,
    };

    const action = decide(ctx, stats, mockConfig);
    expect(action.type).toBe("SELL_ALL");

    // 7% drop -> HOLD
    ctx.price = 93;
    const action2 = decide(ctx, stats, mockConfig);
    expect(action2.type).toBe("HOLD");
  });

  // Entry Signal Tests
  test("Buy entry triggers on confirmed breakout", () => {
    const ctx: GameContext = {
      phase: "TRADING",
      t: 20,
      price: 110,
      reserves: 50000,
      position: 0,
      entryPrice: 0,
      bankroll: 10000,
      peakBankroll: 10000,
      deployable: 10000,
    };

    // Setup stats for breakout: Fast EMA > Slow EMA, Price > RefPrice, Volume rising
    stats.setReferencePrice(100);
    stats.update(100, 10); // 1 discarded
    stats.update(100, 10); // 2 seeded
    stats.update(100, 10); // 3
    stats.update(100, 10); // 4
    stats.update(100, 10); // 5
    stats.update(102, 12); // 6
    stats.update(105, 15); // 7
    stats.update(108, 18); // 8
    stats.update(110, 20); // 9 (current tick)

    const action = decide(ctx, stats, mockConfig, 0.6);
    expect(action.type).toBe("BUY");
    expect(action.amount).toBeGreaterThan(0);
    expect(action.amount).toBeLessThanOrEqual(mockConfig.MAX_BUYIN_USDC);
  });

  test("Skip round if beyond entry deadline", () => {
    const ctx: GameContext = {
      phase: "TRADING",
      t: mockConfig.ENTRY_DEADLINE_S + 5, // past deadline
      price: 110,
      reserves: 50000,
      position: 0,
      entryPrice: 0,
      bankroll: 10000,
      peakBankroll: 10000,
      deployable: 10000,
    };

    stats.setReferencePrice(100);
    stats.update(100, 10);
    stats.update(110, 20);

    const action = decide(ctx, stats, mockConfig);
    expect(action.type).toBe("HOLD"); // skipped
  });

  test("Partial exit on momentum reversal", () => {
    const ctx: GameContext = {
      phase: "TRADING",
      t: 50,
      price: 93, // 7% drop from peak (100) to trigger configured -6% trail
      reserves: 50000,
      position: 10,
      entryPrice: 90,
      bankroll: 10000,
      peakBankroll: 10000,
      deployable: 10000,
    };

    stats.setReferencePrice(80);
    stats.update(90); // 1 discarded
    stats.update(90); // 2 seeded
    stats.update(100); // 3 peak
    stats.resetPeakPrice(); // set peak
    stats.update(93); // 4 drop (-7% drop)

    const action = decide(ctx, stats, mockConfig);
    expect(action.type).toBe("SELL_PARTIAL");
    expect(action.amount).toBe(0.25);
  });

  // Generative parameterized check for multiple time steps to verify exit guarantee
  const tExitCases = Array.from(
    { length: 50 },
    (_, i) => mockConfig.EXIT_DEADLINE_S + i,
  );
  test.each(tExitCases)("Exit guarantee holds for t=%i", (tVal) => {
    const ctx: GameContext = {
      phase: "TRADING",
      t: tVal,
      price: 120,
      reserves: 50000,
      position: 1,
      entryPrice: 100,
      bankroll: 10000,
      peakBankroll: 10000,
      deployable: 10000,
    };
    const action = decide(ctx, stats, mockConfig);
    expect(action.type).toBe("SELL_ALL");
  });

  test("Predator-override logic under decide", () => {
    const predatorConfig: AgentConfig = {
      ...mockConfig,
      PREDATOR_ENABLED: true,
    };

    // Warm up stats for predator trigger
    stats.update(100); // 1 discarded
    for (let i = 0; i < 8; i++) {
      stats.update(100); // 2 to 9
    }

    const ctx: GameContext = {
      phase: "TRADING",
      t: 20,
      price: 100,
      reserves: 50000,
      position: 0,
      entryPrice: 0,
      bankroll: 10000,
      peakBankroll: 10000,
      deployable: 10000,
    };

    // 1. Predator action = BUY -> should BUY if t < entry deadline and size > min
    const actionBuy = decide(ctx, stats, predatorConfig, 0.6, "BUY");
    expect(actionBuy.type).toBe("BUY");
    expect(actionBuy.amount).toBeGreaterThan(0);

    // 2. Predator action = BUY but size is too small -> should HOLD
    const actionBuySmall = decide(ctx, stats, predatorConfig, 0.4, "BUY"); // lower win rate = smaller size
    expect(actionBuySmall.type).toBe("HOLD");

    // 3. Predator action = SELL when holding position -> should SELL_ALL
    ctx.position = 10;
    const actionSell = decide(ctx, stats, predatorConfig, 0.6, "SELL");
    expect(actionSell.type).toBe("SELL_ALL");

    // 4. Predator action = SELL but not holding position -> should HOLD
    ctx.position = 0;
    const actionSellNoPos = decide(ctx, stats, predatorConfig, 0.6, "SELL");
    expect(actionSellNoPos.type).toBe("HOLD");

    // 5. Predator action = HOLD -> should fallback to normal momentum logic
    const actionHold = decide(ctx, stats, predatorConfig, 0.6, "HOLD");
    expect(actionHold.type).toBe("HOLD");

    // 6. Predator action = BUY but PREDATOR_ENABLED is false -> should HOLD (ignored)
    const actionDisabled = decide(ctx, stats, mockConfig, 0.6, "BUY");
    expect(actionDisabled.type).toBe("HOLD");

    // 7. Predator action = BUY with deployable capital clamping
    const ctxDeployable: GameContext = {
      ...ctx,
      deployable: 98,
    };
    const actionBuyClamped = decide(
      ctxDeployable,
      stats,
      predatorConfig,
      0.6,
      "BUY",
    );
    expect(actionBuyClamped.type).toBe("BUY");
    expect(actionBuyClamped.amount).toBeCloseTo(98, 2);

    // 8. Predator action = BUY with deployable capital below MIN_SIZE
    const ctxDeployableTooSmall: GameContext = {
      ...ctx,
      deployable: 30,
    };
    const actionBuyTooSmall = decide(
      ctxDeployableTooSmall,
      stats,
      predatorConfig,
      0.6,
      "BUY",
    );
    expect(actionBuyTooSmall.type).toBe("HOLD");
  });

  // Deployable capital clamping tests
  test("deployable clamps the buy", () => {
    const ctx: GameContext = {
      phase: "TRADING",
      t: 20,
      price: 110,
      reserves: 50000,
      position: 0,
      entryPrice: 0,
      bankroll: 10000,
      peakBankroll: 10000,
      deployable: 98, // limited deployable capital
    };

    // Setup breakout conditions with warmup
    stats.setReferencePrice(100);
    stats.update(100); // 1 discarded
    for (let i = 0; i < 7; i++) {
      stats.update(100); // 2 to 8 (warmed up)
    }
    stats.update(110); // 9 (breakout)

    const action = decide(ctx, stats, mockConfig, 0.6); // winRate 0.60 -> Kelly sizing around ~500 USDC
    expect(action.type).toBe("BUY");
    expect(action.amount).toBeCloseTo(98, 2); // clamped to deployable
  });

  test("deployable below MIN_SIZE -> skip", () => {
    const ctx: GameContext = {
      phase: "TRADING",
      t: 20,
      price: 110,
      reserves: 50000,
      position: 0,
      entryPrice: 0,
      bankroll: 10000,
      peakBankroll: 10000,
      deployable: 30, // below MIN_SIZE_USDC of 50
    };

    // Setup breakout conditions with warmup
    stats.setReferencePrice(100);
    stats.update(100); // 1 discarded
    for (let i = 0; i < 7; i++) {
      stats.update(100); // 2 to 8 (warmed up)
    }
    stats.update(110); // 9 (breakout)

    const action = decide(ctx, stats, mockConfig, 0.6);
    expect(action.type).toBe("HOLD"); // skipped because 30 < 50
  });

  test("deployable undefined under momentum breakout -> fail closed and HOLD", () => {
    const ctx: GameContext = {
      phase: "TRADING",
      t: 20,
      price: 110,
      reserves: 50000,
      position: 0,
      entryPrice: 0,
      bankroll: 10000,
      peakBankroll: 10000,
      deployable: undefined, // undefined -> fail closed to 0
    };

    // Setup breakout conditions with warmup
    stats.setReferencePrice(100);
    stats.update(100); // 1 discarded
    for (let i = 0; i < 7; i++) {
      stats.update(100); // 2 to 8 (warmed up)
    }
    stats.update(110); // 9 (breakout)

    const action = decide(ctx, stats, mockConfig, 0.6);
    expect(action.type).toBe("HOLD"); // fail-closed to 0 < MIN_SIZE_USDC
  });

  test("deployable above Kelly -> Kelly wins", () => {
    const ctx: GameContext = {
      phase: "TRADING",
      t: 20,
      price: 110,
      reserves: 50000,
      position: 0,
      entryPrice: 0,
      bankroll: 10000,
      peakBankroll: 10000,
      deployable: 5000, // excess deployable capital
    };

    // Setup breakout with warmup
    stats.setReferencePrice(100);
    stats.update(100); // 1 discarded
    for (let i = 0; i < 7; i++) {
      stats.update(100); // 2 to 8 (warmed up)
    }
    stats.update(110); // 9 (breakout)

    const action = decide(ctx, stats, mockConfig, 0.55);
    // Kelly is around ~500 USDC (0.5 * 0.10 * 10,000 = 500)
    expect(action.type).toBe("BUY");
    expect(action.amount).toBeCloseTo(500, 2); // Kelly size is chosen over deployable
  });

  test("MAX_BUYIN still caps when bankroll and deployable are huge", () => {
    const ctx: GameContext = {
      phase: "TRADING",
      t: 20,
      price: 110,
      reserves: 50000,
      position: 0,
      entryPrice: 0,
      bankroll: 50000, // huge bankroll -> Kelly ~2500
      peakBankroll: 50000,
      deployable: 10000,
    };

    // Setup breakout with warmup
    stats.setReferencePrice(100);
    stats.update(100); // 1 discarded
    for (let i = 0; i < 7; i++) {
      stats.update(100); // 2 to 8 (warmed up)
    }
    stats.update(110); // 9 (breakout)

    const action = decide(ctx, stats, mockConfig, 0.6);
    expect(action.type).toBe("BUY");
    expect(action.amount).toBe(mockConfig.MAX_BUYIN_USDC); // capped at MAX_BUYIN (1000)
  });

  test("Warmup gate blocks BUY before config.WARMUP_TICKS", () => {
    const ctx: GameContext = {
      phase: "TRADING",
      t: 20,
      price: 110,
      reserves: 50000,
      position: 0,
      entryPrice: 0,
      bankroll: 10000,
      peakBankroll: 10000,
    };

    stats.setReferencePrice(100);
    stats.update(100); // 1 discarded
    stats.update(102); // 2
    stats.update(105); // 3
    stats.update(110); // 4 (not warmed up yet, warmup limit is 8)

    const action = decide(ctx, stats, mockConfig, 0.6);
    expect(action.type).toBe("HOLD");
  });

  test("Breakout is ignored if price increase is below MIN_BREAKOUT_PCT", () => {
    const ctx: GameContext = {
      phase: "TRADING",
      t: 20,
      price: 101, // 1% increase, MIN_BREAKOUT_PCT is 1.5% (needs to exceed 101.5)
      reserves: 50000,
      position: 0,
      entryPrice: 0,
      bankroll: 10000,
      peakBankroll: 10000,
    };

    stats.setReferencePrice(100);
    stats.update(100); // 1 discarded
    for (let i = 0; i < 7; i++) {
      stats.update(100); // 2 to 8 (warmed up)
    }
    stats.update(101); // 9 (price = 101)

    const action = decide(ctx, stats, mockConfig, 0.6);
    expect(action.type).toBe("HOLD"); // below threshold
  });

  test("Falls back to default config parameters when undefined", () => {
    const incompleteConfig: AgentConfig = {
      ...mockConfig,
      WARMUP_TICKS: undefined as any,
      MIN_BREAKOUT_PCT: undefined as any,
      REVERSAL_TRAIL_PCT: undefined as any,
    };

    const ctx: GameContext = {
      phase: "TRADING",
      t: 20,
      price: 110,
      reserves: 50000,
      position: 0,
      entryPrice: 0,
      bankroll: 10000,
      peakBankroll: 10000,
    };

    stats.setReferencePrice(100);
    stats.update(100); // 1 discarded
    stats.update(102); // 2
    stats.update(105); // 3
    stats.update(110); // 4

    // Should HOLD because warmupTicks defaults to 8 (so 4 ticks is not enough)
    const action = decide(ctx, stats, incompleteConfig, 0.6);
    expect(action.type).toBe("HOLD");
  });

  test("ENTRY_MIN_T floor ignores early breakout", () => {
    const ctx: GameContext = {
      phase: "TRADING",
      t: 10, // less than ENTRY_MIN_T of 15
      price: 110,
      reserves: 50000,
      position: 0,
      entryPrice: 0,
      bankroll: 10000,
      peakBankroll: 10000,
      deployable: 10000,
    };

    stats.setReferencePrice(100);
    stats.update(100, 10); // 1 discarded
    stats.update(100, 10); // 2
    stats.update(100, 10); // 3
    stats.update(100, 10); // 4
    stats.update(100, 10); // 5
    stats.update(102, 12); // 6
    stats.update(105, 15); // 7
    stats.update(108, 18); // 8
    stats.update(110, 20); // 9 (breakout)

    const action = decide(ctx, stats, mockConfig, 0.6);
    expect(action.type).toBe("HOLD"); // ignored because t < 15

    ctx.t = 15; // exactly at ENTRY_MIN_T
    const action2 = decide(ctx, stats, mockConfig, 0.6);
    expect(action2.type).toBe("BUY");
  });

  test("EMA_MARGIN requirement filter noise cross", () => {
    const ctx: GameContext = {
      phase: "TRADING",
      t: 20,
      price: 110,
      reserves: 50000,
      position: 0,
      entryPrice: 0,
      bankroll: 10000,
      peakBankroll: 10000,
      deployable: 10000,
    };

    stats.setReferencePrice(100);
    stats.update(100, 10); // 1 discarded
    for (let i = 0; i < 8; i++) {
      stats.update(100, 10);
    }

    // Force vol rising to avoid volume check issues in test
    vi.spyOn(stats, "isVolumeRising").mockReturnValue(true);

    // Case 1: emaFast is 100.1, emaSlow is 100.0 (cross margin = 0.1% < 0.4%) -> HOLD
    (stats as any).state.emaFast = 100.1;
    (stats as any).state.emaSlow = 100.0;
    const action = decide(ctx, stats, mockConfig, 0.6);
    expect(action.type).toBe("HOLD");

    // Case 2: emaFast is 100.5, emaSlow is 100.0 (cross margin = 0.5% > 0.4%) -> BUY
    (stats as any).state.emaFast = 100.5;
    (stats as any).state.emaSlow = 100.0;
    const action2 = decide(ctx, stats, mockConfig, 0.6);
    expect(action2.type).toBe("BUY");
  });

  test("Dissolution mode routing and early hold", () => {
    const dissoConfig: AgentConfig = {
      ...mockConfig,
      STRATEGY_MODE: "dissolution",
      DISSO_ACCUMULATE_T: 150,
      DISSO_MIN_CRASH_PCT: -0.4,
      DISSO_MAX_BUYIN_USDC: 200,
    };

    const ctx: GameContext = {
      phase: "TRADING",
      t: 140, // t < accumT
      price: 50,
      reserves: 50000,
      position: 0,
      entryPrice: 0,
      bankroll: 10000,
      peakBankroll: 10000,
    };

    stats.setReferencePrice(100);
    // Even if price has crashed 50% (50/100), it should hold because t < 150
    const action = decide(ctx, stats, dissoConfig);
    expect(action.type).toBe("HOLD");
  });

  test("Dissolution mode late buy on crash", () => {
    const dissoConfig: AgentConfig = {
      ...mockConfig,
      STRATEGY_MODE: "dissolution",
      DISSO_ACCUMULATE_T: 150,
      DISSO_MIN_CRASH_PCT: -0.4,
      DISSO_MAX_BUYIN_USDC: 200,
    };

    const ctx: GameContext = {
      phase: "TRADING",
      t: 150, // t >= accumT
      price: 50, // crashed 50% from ref (100)
      reserves: 1000, // reserves > cap (200)
      position: 0,
      entryPrice: 0,
      bankroll: 10000,
      peakBankroll: 10000,
      deployable: 500,
    };

    stats.setReferencePrice(100);

    // Should BUY because all conditions are met
    const action = decide(ctx, stats, dissoConfig);
    expect(action.type).toBe("BUY");
    expect(action.amount).toBe(200); // capped at DISSO_MAX_BUYIN_USDC
  });

  test("Dissolution mode with deployable undefined -> fail closed and HOLD", () => {
    const dissoConfig: AgentConfig = {
      ...mockConfig,
      STRATEGY_MODE: "dissolution",
      DISSO_ACCUMULATE_T: 150,
      DISSO_MIN_CRASH_PCT: -0.4,
      DISSO_MAX_BUYIN_USDC: 200,
    };

    const ctx: GameContext = {
      phase: "TRADING",
      t: 150, // t >= accumT
      price: 50, // crashed 50% from ref (100)
      reserves: 1000, // reserves > cap (200)
      position: 0,
      entryPrice: 0,
      bankroll: 10000,
      peakBankroll: 10000,
      deployable: undefined, // undefined -> fail closed to 0
    };

    stats.setReferencePrice(100);

    const action = decide(ctx, stats, dissoConfig);
    expect(action.type).toBe("HOLD"); // fail-closed to 0 < MIN_SIZE_USDC
  });

  test("Dissolution mode shallow drop hold", () => {
    const dissoConfig: AgentConfig = {
      ...mockConfig,
      STRATEGY_MODE: "dissolution",
      DISSO_ACCUMULATE_T: 150,
      DISSO_MIN_CRASH_PCT: -0.4,
      DISSO_MAX_BUYIN_USDC: 200,
    };

    const ctx: GameContext = {
      phase: "TRADING",
      t: 150,
      price: 90, // only dropped 10% from ref (100)
      reserves: 1000,
      position: 0,
      entryPrice: 0,
      bankroll: 10000,
      peakBankroll: 10000,
      deployable: 500,
    };

    stats.setReferencePrice(100);

    // Should HOLD because price drop is shallow
    const action = decide(ctx, stats, dissoConfig);
    expect(action.type).toBe("HOLD");
  });

  test("Dissolution mode holds position through dissolution", () => {
    const dissoConfig: AgentConfig = {
      ...mockConfig,
      STRATEGY_MODE: "dissolution",
      DISSO_ACCUMULATE_T: 150,
      DISSO_MIN_CRASH_PCT: -0.4,
      DISSO_MAX_BUYIN_USDC: 200,
    };

    const ctx: GameContext = {
      phase: "TRADING",
      t: 179, // near T=180 exit deadline
      price: 40,
      reserves: 1000,
      position: 10, // holding position
      entryPrice: 50,
      bankroll: 10000,
      peakBankroll: 10000,
      deployable: 500,
    };

    stats.setReferencePrice(100);

    // Should HOLD (not SELL_ALL or STOP_LOSS or trim)
    const action = decide(ctx, stats, dissoConfig);
    expect(action.type).toBe("HOLD");
  });

  test("Dissolution mode does NOT force-exit at/after EXIT_DEADLINE_S (holds through)", () => {
    const cfg = { ...mockConfig, STRATEGY_MODE: "dissolution" } as AgentConfig;
    const ctx: GameContext = {
      phase: "TRADING",
      t: cfg.EXIT_DEADLINE_S + 10,      // past the momentum-mode exit deadline
      price: 50,
      reserves: 5000,
      position: 500,                    // holding tokens
      entryPrice: 0,
      bankroll: 10000,
      peakBankroll: 10000,
      deployable: 10000,
    };
    const action = decide(ctx, stats, cfg);
    expect(action.type).toBe("HOLD");   // must NOT be SELL_ALL
  });

  test("Dissolution accumulates on crash only when a reference price is seeded", () => {
    const cfg = { ...mockConfig, STRATEGY_MODE: "dissolution" } as AgentConfig;
    const ctx: GameContext = {
      phase: "TRADING",
      t: (cfg.DISSO_ACCUMULATE_T ?? 150) + 5,
      price: 50,
      reserves: 5000,
      position: 0,
      entryPrice: 0,
      bankroll: 10000,
      peakBankroll: 10000,
      deployable: 10000,
    };

    // ref unseeded (0) -> drawdown forced to 0 -> NO buy
    stats.setReferencePrice(0);
    expect(decide(ctx, stats, cfg).type).toBe("HOLD");

    // ref seeded at the open (100), price crashed -50% -> BUY
    stats.setReferencePrice(100);
    expect(decide(ctx, stats, cfg).type).toBe("BUY");
  });

  test("Momentum mode with custom ENTRY_MIN_T and EMA_MARGIN", () => {
    const customConfig: AgentConfig = {
      ...mockConfig,
      ENTRY_MIN_T: 20,
      EMA_MARGIN: 0.005,
    };
    const ctx: GameContext = {
      phase: "TRADING",
      t: 19, // less than ENTRY_MIN_T of 20
      price: 105,
      reserves: 50000,
      position: 0,
      entryPrice: 0,
      bankroll: 10000,
      peakBankroll: 10000,
      deployable: 500,
    };

    // Fast EMA > slow EMA * (1 + 0.005)
    (stats as any).state.emaFast = 101;
    (stats as any).state.emaSlow = 100;
    (stats as any).state.tickCount = 10;
    stats.setReferencePrice(100);

    // Should HOLD because t < 20
    let action = decide(ctx, stats, customConfig);
    expect(action.type).toBe("HOLD");

    // At t >= 20, it should BUY if breakout is met
    ctx.t = 20;
    action = decide(ctx, stats, customConfig);
    expect(action.type).toBe("BUY");
  });

  test("Dissolution mode with fallback defaults and edge cases", () => {
    const fallbackConfig: any = {
      ...mockConfig,
      STRATEGY_MODE: "dissolution",
      DISSO_ACCUMULATE_T: undefined,
      DISSO_MIN_CRASH_PCT: undefined,
      DISSO_MAX_BUYIN_USDC: undefined,
      MIN_SIZE_USDC: undefined,
    };

    const ctx: GameContext = {
      phase: "TRADING",
      t: 150, // exactly at default DISSO_ACCUMULATE_T (150)
      price: 50,
      reserves: 1000,
      position: 0,
      entryPrice: 0,
      bankroll: 10000,
      peakBankroll: 10000,
      deployable: 10000,
    };

    // Test 1: ref <= 0 (drawdown = 0, so drawdown (0) is > default crashPct (-0.40)) -> should HOLD
    stats.setReferencePrice(0);
    let action = decide(ctx, stats, fallbackConfig);
    expect(action.type).toBe("HOLD");

    // Test 2: ref > 0 and price has crashed (50/100 -> drawdown = -0.50 <= default crashPct (-0.40)) -> should BUY
    stats.setReferencePrice(100);
    action = decide(ctx, stats, fallbackConfig);
    expect(action.type).toBe("BUY");
    expect(action.amount).toBe(200);

    // Test 3: phase !== "TRADING" (e.g. ENDED) -> should HOLD
    const endedCtx = { ...ctx, phase: "ENDED" as const };
    action = decide(endedCtx, stats, fallbackConfig);
    expect(action.type).toBe("HOLD");
  });
});
