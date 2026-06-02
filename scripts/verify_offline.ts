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
};

function runOfflineVerification() {
  console.log("==================================================");
  console.log("       SKEET OFFLINE SAFETY VERIFICATION          ");
  console.log("==================================================");

  const stats = new Signals(5, 20);
  stats.setReferencePrice(100);

  // Generate a mock trading path (price pump then dump)
  const pricePath = Array.from({ length: 180 }, (_, i) => {
    if (i < 30) return 100; // MM phase
    if (i < 100) return 100 + (i - 30) * 0.5; // pump to 135
    return 135 - (i - 100) * 1.5; // dump
  });

  let position = 0;
  let entryPrice = 0;
  let bankroll = 10000;
  let peakBankroll = 10000;
  let didBuy = false;
  let didSell = false;
  let exitSecond = -1;

  for (let t = 0; t < pricePath.length; t++) {
    const price = pricePath[t];
    stats.update(price, t > 30 ? 1000 : 0);

    const phase = t < 30 ? "MARKET_MAKING" : "TRADING";
    const ctx: GameContext = {
      phase,
      t: t < 30 ? t : t - 30, // seconds elapsed in phase
      price,
      reserves: 50000,
      position,
      entryPrice,
      bankroll,
      peakBankroll,
    };

    const action = decide(ctx, stats, mockConfig);

    if (action.type === "BUY" && action.amount) {
      if (action.amount > mockConfig.MAX_BUYIN_USDC) {
        console.error(
          `❌ SAFETY VIOLATION: Position size ${action.amount} exceeds limit of ${mockConfig.MAX_BUYIN_USDC}`,
        );
        process.exit(1);
      }
      position += action.amount / price;
      bankroll -= action.amount;
      entryPrice = price;
      didBuy = true;
      console.log(
        `[t=${t}] Executed BUY of ${action.amount.toFixed(2)} USDC at price ${price.toFixed(2)}`,
      );
    } else if (action.type === "SELL_ALL" && position > 0) {
      const sellVal = position * price;
      bankroll += sellVal;
      position = 0;
      entryPrice = 0;
      didSell = true;
      exitSecond = t - 30;
      console.log(
        `[t=${t}] Executed SELL_ALL (Value: ${sellVal.toFixed(2)} USDC) at price ${price.toFixed(2)}`,
      );
    }

    peakBankroll = Math.max(peakBankroll, bankroll + position * price);

    if (bankroll < 0) {
      console.error(`❌ SAFETY VIOLATION: Bankroll went negative: ${bankroll}`);
      process.exit(1);
    }
  }

  // 1. Assert exit before exit deadline
  if (didBuy && !didSell) {
    console.error(
      "❌ SAFETY VIOLATION: Position was not closed before game ended!",
    );
    process.exit(1);
  }

  if (exitSecond !== -1 && exitSecond > mockConfig.EXIT_DEADLINE_S) {
    console.error(
      `❌ SAFETY VIOLATION: Position closed at second ${exitSecond}, past deadline ${mockConfig.EXIT_DEADLINE_S}`,
    );
    process.exit(1);
  }

  console.log("--------------------------------------------------");
  console.log("✅ verification passed:");
  console.log(
    `   - Exit deadline respected: closed at second ${exitSecond} (limit: ${mockConfig.EXIT_DEADLINE_S})`,
  );
  console.log("   - Position sizing capped under 1000 USDC");
  console.log(
    `   - Bankroll remained positive (Final: ${bankroll.toFixed(2)} USDC)`,
  );
  console.log("==================================================");
}

runOfflineVerification();
