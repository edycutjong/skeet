import { AgentConfig } from "./types.js";

/**
 * Calculates the Kelly Fraction: (p * (b + 1) - 1) / b
 * where:
 *   p = edge (probability of winning, e.g. 0.55)
 *   b = odds (payout ratio, e.g. 1.0 for even money)
 */
export function kellyFraction(p: number, b: number = 1.0): number {
  if (isNaN(p) || p <= 0) return 0;
  if (b <= 0) return 0;
  const fraction = (p * (b + 1) - 1) / b;
  return Math.max(0, fraction);
}

/**
 * Calculates the size of a position in USDC based on Kelly Criterion, bankroll, and peak drawdown.
 */
export function kellySize(
  edge: number, // Win probability p, e.g., 0.55
  bankroll: number,
  peak: number,
  config: AgentConfig,
  odds: number = 1.0,
): number {
  // Prevent any negative calculations or zero division
  if (bankroll <= 0 || peak <= 0) return 0;

  const fraction = kellyFraction(edge, odds);
  const base = config.KELLY_FRACTION * fraction * bankroll;

  // Quadratic drawdown throttle: (bankroll / peak) ^ 2
  const ratio = Math.min(1.0, bankroll / peak);
  const throttle = Math.pow(ratio, 2);

  let size = base * throttle;

  // Clamp size to [0, MAX_BUYIN_USDC]
  size = Math.min(size, config.MAX_BUYIN_USDC);
  size = Math.max(0, size);

  // Probe mode: if bankroll is below floor, rebuild slowly with minimum probe sizes
  const floor = config.DRAWDOWN_FLOOR_PCT * config.START_BANKROLL;
  if (bankroll < floor) {
    size = Math.min(size, config.MIN_SIZE_USDC);
  }

  return size;
}
