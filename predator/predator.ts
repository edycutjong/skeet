import { Signals } from '../src/signals.js';

export interface TradeEvent {
  timestamp: number;
  token_address: string;
  tx_from: string;
  is_buy: number;
  amount_in: string;
  amount_out: string;
  price: string;
  tx_hash: string;
}

export class MeanReversionPredator {
  private enabled: boolean;
  private opponentTrades: Map<string, TradeEvent[]> = new Map();
  private hostedAgentAddresses: Set<string> = new Set();
  
  constructor(enabled: boolean = false) {
    this.enabled = enabled;
  }

  /**
   * Process historical trade list to discover hosted agents and estimate their parameters
   */
  public ingestTrades(trades: TradeEvent[]) {
    if (!this.enabled || !trades || trades.length === 0) return;

    // Group trades by sender EOA
    for (const trade of trades) {
      if (!trade.tx_from) continue;
      
      const history = this.opponentTrades.get(trade.tx_from) || [];
      history.push(trade);
      this.opponentTrades.set(trade.tx_from, history);
    }

    // Host agent discovery: hosted agents trade frequently and have systematic buy/sell patterns
    for (const [address, history] of this.opponentTrades.entries()) {
      if (history.length >= 5) {
        // Simple heuristic: if they have both buy and sell trades, they are active traders
        const buys = history.filter(t => t.is_buy === 1).length;
        const sells = history.filter(t => t.is_buy === 0).length;
        if (buys >= 2 && sells >= 2) {
          this.hostedAgentAddresses.add(address);
        }
      }
    }
  }

  /**
   * Evaluates if we should front-run hosted bot triggers
   * Returns:
   *   'BUY' if we predict hosted bots are about to buy
   *   'SELL' if we predict hosted bots are about to sell
   *   'HOLD' otherwise
   */
  public evaluate(currentPrice: number, stats: Signals): 'BUY' | 'SELL' | 'HOLD' {
    if (!this.enabled || this.hostedAgentAddresses.size === 0) {
      return 'HOLD';
    }

    const emaSlow = stats.getEmaSlow();
    const realizedVol = stats.getRealizedVol();

    // Hosted MeanReversion bot triggers are typically mean ± k * sigma
    // We use emaSlow as the proxy for the rolling mean
    // sigma is proxied by realizedVol * emaSlow
    const sigma = realizedVol * emaSlow;
    
    // Assume typical k parameter between 1.5 and 2.0
    const kBuy = 1.8;
    const kSell = 1.8;
    
    const predictedBuyTrigger = emaSlow - kBuy * sigma;
    const predictedSellTrigger = emaSlow + kSell * sigma;

    // Front-run: trigger slightly earlier (e.g. 1% buffer)
    if (currentPrice <= predictedBuyTrigger * 1.01 && currentPrice > predictedBuyTrigger) {
      return 'BUY';
    }

    if (currentPrice >= predictedSellTrigger * 0.99 && currentPrice < predictedSellTrigger) {
      return 'SELL';
    }

    return 'HOLD';
  }

  public getHostedAgentsCount(): number {
    return this.hostedAgentAddresses.size;
  }
}
