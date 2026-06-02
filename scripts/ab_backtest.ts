import { decide } from "../src/decide.js";
import { Signals } from "../src/signals.js";
import { AgentConfig, GameContext } from "../src/types.js";

const momentumConfig: AgentConfig = {
  STRATEGY_MODE: "momentum",
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

const dissolutionConfig: AgentConfig = {
  STRATEGY_MODE: "dissolution",
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
  DISSO_ACCUMULATE_T: 150,
  DISSO_MIN_CRASH_PCT: -0.4,
  DISSO_MAX_BUYIN_USDC: 200,
};

class SimulatedAgent {
  public position: number = 0;
  public entryPrice: number = 0;
  public bankroll: number = 10000;
  public peakBankroll: number = 10000;
  public mode: "momentum" | "dissolution";
  public config: AgentConfig;

  constructor(mode: "momentum" | "dissolution", config: AgentConfig) {
    this.mode = mode;
    this.config = config;
  }

  public execute(price: number, stats: Signals, t: number, reserves: number) {
    const ctx: GameContext = {
      phase: "TRADING",
      t,
      price,
      reserves,
      position: this.position,
      entryPrice: this.entryPrice,
      bankroll: this.bankroll,
      peakBankroll: this.peakBankroll,
      deployable: 100, // Safe balance limit
    };

    const action = decide(ctx, stats, this.config);

    if (action.type === "BUY" && action.amount) {
      this.position += action.amount / price;
      this.bankroll -= action.amount;
      this.entryPrice = price;
      console.log(
        `    [${this.mode.toUpperCase()}][t=${t}] BUY ${action.amount.toFixed(2)} USDC at price ${price.toFixed(4)}. Tokens: ${this.position.toFixed(4)}`,
      );
    } else if (action.type === "SELL_ALL" && this.position > 0) {
      const sellVal = this.position * price;
      this.bankroll += sellVal;
      this.position = 0;
      this.entryPrice = 0;
      console.log(
        `    [${this.mode.toUpperCase()}][t=${t}] SELL_ALL at price ${price.toFixed(4)}. Received: ${sellVal.toFixed(2)} USDC`,
      );
    } else if (
      action.type === "SELL_PARTIAL" &&
      this.position > 0 &&
      action.amount
    ) {
      const sellAmount = this.position * action.amount;
      const sellVal = sellAmount * price;
      this.bankroll += sellVal;
      this.position -= sellAmount;
      console.log(
        `    [${this.mode.toUpperCase()}][t=${t}] SELL_PARTIAL ${action.amount * 100}% at price ${price.toFixed(4)}. Received: ${sellVal.toFixed(2)} USDC`,
      );
    }

    this.peakBankroll = Math.max(
      this.peakBankroll,
      this.bankroll + this.position * price,
    );
  }

  // Settle dissolution at end of round (T=180)
  public settleDissolution(finalPrice: number, reserves: number) {
    if (this.position > 0) {
      if (this.mode === "dissolution") {
        // In dissolution mode, we hold tokens through the cliff to claim reserves.
        // We model: other agents have sold, so total tokens held by all agents is small.
        // Let's assume total tokens held by all agents is agent's position + 1 token.
        const totalTokensHeld = this.position + 1.0;
        const share = this.position / totalTokensHeld;
        const payout = reserves * share;
        this.bankroll += payout;
        console.log(
          `    [DISSOLUTION][SETTLE] Held ${this.position.toFixed(4)} tokens through cliff. Share: ${(share * 100).toFixed(1)}% of ${reserves.toFixed(2)} USDC pool. Payout: ${payout.toFixed(2)} USDC`,
        );
      } else {
        // Momentum mode should have exited before T=180, but if it didn't, it sells at final price with 15% slippage.
        const sellVal = this.position * finalPrice * 0.85;
        this.bankroll += sellVal;
        console.log(
          `    [MOMENTUM][SETTLE] Forced liquidation with slippage. Received: ${sellVal.toFixed(2)} USDC`,
        );
      }
      this.position = 0;
      this.entryPrice = 0;
    }
  }
}

function runABBacktest() {
  console.log("==================================================");
  console.log("          SKEET A/B STRATEGY BACKTESTER           ");
  console.log("==================================================");

  const roundTypes = ["PUMP", "DUMP", "RANGE"];

  for (const type of roundTypes) {
    console.log(`\n--- Running ${type} Round Simulation ---`);
    const stats = new Signals(5, 20);
    stats.setReferencePrice(100);

    const mAgent = new SimulatedAgent("momentum", momentumConfig);
    const dAgent = new SimulatedAgent("dissolution", dissolutionConfig);

    // Generate price path
    const length = 210;
    const prices: number[] = [];
    for (let t = 0; t < length; t++) {
      if (t < 30) {
        // MM Phase
        prices.push(100);
      } else {
        // Trading Phase
        const elapsed = t - 30;
        if (type === "PUMP") {
          prices.push(100 + elapsed * 0.8); // pump up to 220
        } else if (type === "DUMP") {
          prices.push(Math.max(10, 100 - elapsed * 0.5)); // dump down to 25
        } else {
          prices.push(100 + Math.sin(elapsed * 0.1) * 8); // range [92, 108]
        }
      }
    }

    // Run ticks
    const reservesInit = 50000;
    for (let t = 0; t < length; t++) {
      const price = prices[t];
      // Simulate volume rising dynamically
      const volume = t > 30 ? 1000 + (t - 30) * 100 : 0;
      stats.update(price, volume);

      if (t >= 30) {
        const elapsed = t - 30;
        const currentReserves = type === "DUMP" ? 1000 : reservesInit; // low reserves for dump round to be realistic
        mAgent.execute(price, stats, elapsed, currentReserves);
        dAgent.execute(price, stats, elapsed, currentReserves);
      }
    }

    // End of round settlement
    const finalPrice = prices[length - 1];
    const finalReserves = type === "DUMP" ? 1000 : reservesInit;
    mAgent.settleDissolution(finalPrice, finalReserves);
    dAgent.settleDissolution(finalPrice, finalReserves);

    console.log(`  Results for ${type} Round:`);
    console.log(
      `    Momentum PnL:    ${(mAgent.bankroll - 10000).toFixed(2).padStart(8)} USDC`,
    );
    console.log(
      `    Dissolution PnL: ${(dAgent.bankroll - 10000).toFixed(2).padStart(8)} USDC`,
    );
  }
  console.log("\n==================================================");
}

runABBacktest();
