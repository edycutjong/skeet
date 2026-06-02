import { describe, test, expect } from "vitest";
import { kellyFraction, kellySize } from "../src/risk.js";
import { AgentConfig } from "../src/types.js";

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
};

describe("Risk engine calculations", () => {
  // Test Kelly Fraction math
  test("Kelly Fraction calculations", () => {
    // b = 1.0 (even money)
    expect(kellyFraction(0.5, 1.0)).toBe(0); // 0.5 * 2 - 1 = 0
    expect(kellyFraction(0.55, 1.0)).toBeCloseTo(0.1, 5); // 0.55 * 2 - 1 = 0.1
    expect(kellyFraction(0.6, 1.0)).toBeCloseTo(0.2, 5); // 0.60 * 2 - 1 = 0.2
    expect(kellyFraction(0.4, 1.0)).toBe(0); // negative clamped to 0

    // b = 2.0 (2-to-1 payout)
    expect(kellyFraction(0.4, 2.0)).toBeCloseTo(0.1, 5); // (0.4 * 3 - 1) / 2 = 0.1
    expect(kellyFraction(0.3, 2.0)).toBe(0); // negative clamped to 0

    // edge cases
    expect(kellyFraction(NaN, 1.0)).toBe(0);
    expect(kellyFraction(-0.5, 1.0)).toBe(0);
    expect(kellyFraction(0.5, 0)).toBe(0);
    expect(kellyFraction(0.5, -2)).toBe(0);
  });

  // Parameterized tests for size monotonicity with bankroll
  const bankrollScaleCases = [
    { bankroll: 10000, expectedSize: 500 }, // kelly fraction = 0.1 (55% win rate, 1:1 odds), KELLY_FRACTION = 0.5 -> 0.5 * 0.1 * 10000 = 500
    { bankroll: 5000, expectedSize: 62.5 }, // peak = 10000, throttle = (5k/10k)^2 = 0.25 -> base = 250 * 0.25 = 62.5
    { bankroll: 8000, expectedSize: 256 }, // base = 400, throttle = 0.64 -> 400 * 0.64 = 256
  ];

  test.each(bankrollScaleCases)(
    "Sizing monotonicity with bankroll %#",
    ({ bankroll, expectedSize }) => {
      const size = kellySize(0.55, bankroll, 10000, mockConfig);
      expect(size).toBeCloseTo(expectedSize, 1);
    },
  );

  // Parameterized test cases for cap enforcement
  const capCases = [
    { bankroll: 30000, peak: 30000, expectedSize: 1000 }, // uncapped base = 0.5 * 0.1 * 30000 = 1500 -> capped to 1000
    { bankroll: 50000, peak: 50000, expectedSize: 1000 }, // uncapped base = 2500 -> capped to 1000
  ];

  test.each(capCases)(
    "Cap enforcement for large bankrolls %#",
    ({ bankroll, peak, expectedSize }) => {
      const size = kellySize(0.55, bankroll, peak, mockConfig);
      expect(size).toBe(expectedSize);
    },
  );

  // Drawdown throttle quadratic check
  test("Drawdown throttle decreases quadratically", () => {
    const size100 = kellySize(0.55, 10000, 10000, mockConfig); // 500
    const size50 = kellySize(0.55, 5000, 10000, mockConfig); // base: 250 * throttle (0.25) = 62.5

    // Check that size drops more than linearly (half bankroll -> 1/8th size because of base reduction + throttle)
    expect(size50).toBeLessThan(size100 / 4);
  });

  // Probe-mode floor tests
  test("Probe mode threshold limits sizes when bankroll is below floor", () => {
    // Floor is 30% of 10000 = 3000 USDC
    // Bankroll = 2000 USDC (below floor)
    // Base size without floor: base = 0.5 * 0.1 * 2000 = 100, throttle = (2k/10k)^2 = 0.04 -> size = 4
    const sizeNormal = kellySize(0.55, 2000, 10000, mockConfig);
    expect(sizeNormal).toBeLessThan(mockConfig.MIN_SIZE_USDC);

    // Let's test with a high edge/win rate so base size would be large, but bankroll is low
    // Base size without floor: base = 0.5 * 0.6 * 2000 = 600, throttle = (2k/2k)^2 = 1.0 -> size = 600
    // But since bankroll is below floor (2000 < 3000), size should be capped to MIN_SIZE_USDC (50)
    const sizeCapped = kellySize(0.8, 2000, 2000, mockConfig);
    expect(sizeCapped).toBe(mockConfig.MIN_SIZE_USDC);
  });

  // Safety checks (never negative, zero, NaN handles)
  test("Safety parameters for invalid entries", () => {
    expect(kellySize(-0.5, 10000, 10000, mockConfig)).toBe(0);
    expect(kellySize(0.55, -100, 10000, mockConfig)).toBe(0);
    expect(kellySize(0.55, 10000, 0, mockConfig)).toBe(0);
    expect(kellySize(NaN, 10000, 10000, mockConfig)).toBe(0);
  });

  // Generate 40 parameterized test cases dynamically to verify fine-grained monotonicity
  const pCases = Array.from({ length: 40 }, (_, i) => 0.51 + i * 0.01);
  test.each(pCases)("Monotonicity check for probability p=%f", (p) => {
    const size1 = kellySize(p, 10000, 10000, mockConfig);
    const size2 = kellySize(p + 0.005, 10000, 10000, mockConfig);

    if (size1 < mockConfig.MAX_BUYIN_USDC) {
      expect(size2).toBeGreaterThanOrEqual(size1);
    }
  });
});
