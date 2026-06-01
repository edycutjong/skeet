import { describe, test, expect } from 'vitest';
import { Signals } from '../src/signals.js';

describe('Signals statistics engine tests', () => {
  test('Initial state parameters are 0', () => {
    const sigs = new Signals(5, 20);
    expect(sigs.getEmaFast()).toBe(0);
    expect(sigs.getEmaSlow()).toBe(0);
    expect(sigs.getRealizedVol()).toBe(0);
    expect(sigs.getTickCount()).toBe(0);
  });

  test('First tick EMA matches the price exactly', () => {
    const sigs = new Signals(5, 20);
    sigs.update(100);
    expect(sigs.getEmaFast()).toBe(100);
    expect(sigs.getEmaSlow()).toBe(100);
    expect(sigs.getRealizedVol()).toBe(0.05); // default fallback vol
  });

  // Parameterized tests for EMA computation over a series of ticks
  const priceCases = [
    { prices: [100, 110], expectedFast: 103.333, expectedSlow: 100.952 },
    { prices: [100, 110, 120], expectedFast: 108.888, expectedSlow: 102.766 },
    { prices: [100, 90, 80], expectedFast: 91.11, expectedSlow: 97.23 }
  ];

  test.each(priceCases)('EMA fast/slow crossovers over price series %#', ({ prices, expectedFast, expectedSlow }) => {
    const sigs = new Signals(5, 20);
    for (const p of prices) {
      sigs.update(p);
    }
    expect(sigs.getEmaFast()).toBeCloseTo(expectedFast, 2);
    expect(sigs.getEmaSlow()).toBeCloseTo(expectedSlow, 2);
  });

  // Parameterized tests for realized volatility
  const volCases = [
    { prices: [100, 100, 100, 100], expectedVol: 0 },
    { prices: [100, 101, 100, 101, 100], expectedVol: 0.01 }, // low vol
    { prices: [100, 120, 90, 140, 70], expectedVol: 0.35 }  // high vol
  ];

  test.each(volCases)('Volatility calculations for series %#', ({ prices, expectedVol }) => {
    const sigs = new Signals(5, 20);
    for (const p of prices) {
      sigs.update(p);
    }
    if (expectedVol === 0) {
      expect(sigs.getRealizedVol()).toBe(0);
    } else {
      expect(sigs.getRealizedVol()).toBeGreaterThan(expectedVol * 0.5);
    }
  });

  // Test edge cases: flat price, single tick, gaps
  test('Edge cases for signals update', () => {
    const sigs = new Signals(5, 20);
    sigs.update(0); // Should be ignored
    expect(sigs.getTickCount()).toBe(0);

    sigs.update(-50); // Should be ignored
    expect(sigs.getTickCount()).toBe(0);

    sigs.update(100);
    expect(sigs.getTickCount()).toBe(1);

    sigs.update(100);
    expect(sigs.getRealizedVol()).toBe(0.05); // default fallback
  });

  // Volume momentum checks
  test('Volume rising indicator behavior', () => {
    const sigs = new Signals(5, 20);
    // Not enough volumes -> default to true
    expect(sigs.isVolumeRising()).toBe(true);

    sigs.update(100, 10);
    sigs.update(100, 12);
    sigs.update(100, 15);
    sigs.update(100, 18);
    // Increasing volumes
    expect(sigs.isVolumeRising()).toBe(true);

    // Decreasing volumes
    const sigs2 = new Signals(5, 20);
    sigs2.update(100, 20);
    sigs2.update(100, 18);
    sigs2.update(100, 12);
    sigs2.update(100, 8);
    expect(sigs2.isVolumeRising()).toBe(false);
  });

  // Reversal checks
  test('Reversal detection', () => {
    const sigs = new Signals(5, 20);
    sigs.update(100);
    sigs.resetPeakPrice();
    expect(sigs.isReversalDetected()).toBe(false);

    // Small drop (1%) -> no reversal
    sigs.update(99);
    expect(sigs.isReversalDetected()).toBe(false);

    // Large drop (4%) -> reversal
    sigs.update(96);
    expect(sigs.isReversalDetected()).toBe(true);
  });

  test('Peak price, price history, and volume queue limits', () => {
    const sigs = new Signals(5, 20);
    sigs.update(100, 10);
    
    expect(sigs.getPeakPrice()).toBe(100);
    expect(sigs.getPriceHistory()).toEqual([100]);

    // Push 21 volumes to trigger tradeVolumes.shift()
    for (let i = 0; i < 22; i++) {
      sigs.update(100 + i, i + 1);
    }
    // Also priceHistory exceeds 100 limit (if we update it 101 times)
    for (let i = 0; i < 100; i++) {
      sigs.update(200 + i, 5);
    }
    expect(sigs.getPriceHistory().length).toBe(100);
  });

  test('Reversal branch coverages for tickCount and EMAs', () => {
    const sigs = new Signals(5, 20);
    sigs.update(100);
    // tickCount is 1 (<= 5). Force emaFast < emaSlow
    (sigs as any).state.emaFast = 90;
    (sigs as any).state.emaSlow = 100;
    expect(sigs.isReversalDetected()).toBe(false); // fails tickCount > 5 check

    // Make tickCount 6 but emaFast >= emaSlow
    for (let i = 0; i < 5; i++) {
      sigs.update(100);
    }
    (sigs as any).state.emaFast = 105;
    (sigs as any).state.emaSlow = 100;
    expect(sigs.isReversalDetected()).toBe(false); // fails emaFast < emaSlow check

    // Make tickCount 6 and emaFast < emaSlow (should return true)
    (sigs as any).state.emaFast = 95;
    (sigs as any).state.emaSlow = 100;
    expect(sigs.isReversalDetected()).toBe(true);
  });

  test('computeRealizedVol NaN handling', () => {
    const sigs = new Signals(5, 20);
    sigs.update(100);
    sigs.update(101);
    // Inject NaN into logReturns
    (sigs as any).logReturns = [NaN, NaN];
    // Trigger update to compute volatility
    sigs.update(102);
    expect(sigs.getRealizedVol()).toBe(0.05); // returns fallback 0.05
  });
});
