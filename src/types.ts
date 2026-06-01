export interface GameContext {
  phase: "LOBBY" | "MARKET_MAKING" | "TRADING" | "ENDED";
  t: number;             // time elapsed in seconds since current phase start (or relative time)
  price: number;         // token price in USDC
  reserves: number;      // USDC reserves in pool
  position: number;      // token balance in Trading Safe (scaled)
  bankroll: number;      // current USDC balance in Trading Safe
  peakBankroll: number;  // historical peak of bankroll
  entryPrice: number;    // average entry price of current position (0 if no position)
}

export type ActionType = "BUY" | "SELL_ALL" | "SELL_PARTIAL" | "HOLD";

export interface Action {
  type: ActionType;
  amount?: number;       // For BUY: USDC amount to buy; For SELL_PARTIAL: percentage (0 to 1) or amount of position
}

export interface SignalState {
  emaFast: number;
  emaSlow: number;
  realizedVol: number;
  refPrice: number;
  tickCount: number;
  priceHistory: number[];
}

export interface AgentConfig {
  EMA_FAST: number;
  EMA_SLOW: number;
  ENTRY_DEADLINE_S: number;
  EXIT_DEADLINE_S: number;
  STOP_LOSS_PCT: number;
  KELLY_FRACTION: number;
  MAX_BUYIN_USDC: number;
  START_BANKROLL: number;
  DRAWDOWN_FLOOR_PCT: number;
  MIN_SIZE_USDC: number;
  PREDATOR_ENABLED: boolean;
}
