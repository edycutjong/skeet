import { decide } from "../src/decide.js";
import { Signals } from "../src/signals.js";
import { AgentConfig, GameContext } from "../src/types.js";

const config: AgentConfig = {
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

// Simulated MeanReversion bot logic
class SimulatedMeanReversionAgent {
  public position: number = 0;
  public entryPrice: number = 0;
  public bankroll: number = 10000;
  public peakBankroll: number = 10000;

  public execute(price: number, stats: Signals, t: number) {
    const mean = stats.getEmaSlow();
    const std = stats.getRealizedVol() * mean;

    // Mean reversion buys when price is low, sells when high
    if (this.position === 0 && price < mean - 1.5 * std && t < 120) {
      const size = 500; // flat size
      this.position = size / price;
      this.bankroll -= size;
      this.entryPrice = price;
    } else if (this.position > 0 && price > mean + 1.5 * std) {
      this.bankroll += this.position * price;
      this.position = 0;
      this.entryPrice = 0;
    } else if (this.position > 0 && t >= 179) {
      // Dissolution exit (forced dump with 15% slippage due to cliff stampede)
      this.bankroll += this.position * price * 0.85;
      this.position = 0;
      this.entryPrice = 0;
    }

    this.peakBankroll = Math.max(
      this.peakBankroll,
      this.bankroll + this.position * price,
    );
  }
}

// Skeet simulator wrapper
class SimulatedSkeetAgent {
  public position: number = 0;
  public entryPrice: number = 0;
  public bankroll: number = 10000;
  public peakBankroll: number = 10000;

  public execute(price: number, stats: Signals, t: number) {
    const phase = "TRADING";
    const ctx: GameContext = {
      phase,
      t,
      price,
      reserves: 50000,
      position: this.position,
      entryPrice: this.entryPrice,
      bankroll: this.bankroll,
      peakBankroll: this.peakBankroll,
    };

    const action = decide(ctx, stats, config);

    if (action.type === "BUY" && action.amount) {
      this.position += action.amount / price;
      this.bankroll -= action.amount;
      this.entryPrice = price;
    } else if (action.type === "SELL_ALL" && this.position > 0) {
      // Clean exit (no slippage front-running exit)
      this.bankroll += this.position * price;
      this.position = 0;
      this.entryPrice = 0;
    } else if (
      action.type === "SELL_PARTIAL" &&
      this.position > 0 &&
      action.amount
    ) {
      const sellAmount = this.position * action.amount;
      this.bankroll += sellAmount * price;
      this.position -= sellAmount;
    }

    this.peakBankroll = Math.max(
      this.peakBankroll,
      this.bankroll + this.position * price,
    );
  }
}

function runBacktest() {
  console.log("==================================================");
  console.log("            SKEET BACKTEST SIMULATOR              ");
  console.log("==================================================");

  const roundsCount = 10;
  let totalSkeetPnL = 0;
  let totalMeanReversionPnL = 0;

  for (let r = 1; r <= roundsCount; r++) {
    const stats = new Signals(5, 20);
    stats.setReferencePrice(100);

    const skeet = new SimulatedSkeetAgent();
    const mr = new SimulatedMeanReversionAgent();

    // Define price path depending on round type
    let prices: number[] = [];

    if (r % 3 === 1) {
      // 1. Pump Round (momentum wins, mean reversion bleeds)
      prices = Array.from({ length: 210 }, (_, i) => {
        if (i < 30) return 100;
        return 100 + (i - 30) * 0.8; // pump to 244
      });
    } else if (r % 3 === 2) {
      // 2. Dump Round (Skeet stops out or sits out, MR buys the dip and eats slippage)
      prices = Array.from({ length: 210 }, (_, i) => {
        if (i < 30) return 100;
        return 100 - (i - 30) * 0.4; // dump to 28
      });
    } else {
      // 3. Range-bound Round (both perform decently)
      prices = Array.from({ length: 210 }, (_, i) => {
        if (i < 30) return 100;
        return 100 + Math.sin((i - 30) * 0.1) * 8;
      });
    }

    // Run round
    for (let t = 0; t < prices.length; t++) {
      const price = prices[t];
      stats.update(price, t > 30 ? 1000 : 0);

      if (t >= 30) {
        skeet.execute(price, stats, t - 30);
        mr.execute(price, stats, t - 30);
      }
    }

    const skeetPnL = skeet.bankroll - 10000;
    const mrPnL = mr.bankroll - 10000;

    totalSkeetPnL += skeetPnL;
    totalMeanReversionPnL += mrPnL;

    console.log(
      `Round ${r.toString().padStart(2, "0")} | Skeet PnL: ${skeetPnL.toFixed(2).padStart(8)} USDC | MeanReversion PnL: ${mrPnL.toFixed(2).padStart(8)} USDC`,
    );
  }

  console.log("--------------------------------------------------");
  console.log(
    `TOTALS   | Skeet PnL: ${totalSkeetPnL.toFixed(2).padStart(8)} USDC | MeanReversion PnL: ${totalMeanReversionPnL.toFixed(2).padStart(8)} USDC`,
  );
  console.log("==================================================");

  if (totalSkeetPnL > totalMeanReversionPnL) {
    console.log("✅ BACKTEST PASSED: Skeet outperforms MeanReversion!");
  } else {
    console.warn(
      "⚠️ BACKTEST WARNING: Skeet did not outperform MeanReversion.",
    );
  }
  console.log("==================================================");
}

runBacktest();
