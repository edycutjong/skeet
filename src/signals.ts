import { SignalState } from './types.js';

export class Signals {
  private state: SignalState;
  private fastPeriod: number;
  private slowPeriod: number;
  private peakPrice: number = 0;
  private lastPrice: number = 0;
  
  // Rolling log returns history for realized volatility
  private logReturns: number[] = [];
  // Rolling volume history
  private tradeVolumes: number[] = [];

  constructor(fastPeriod: number = 5, slowPeriod: number = 20) {
    this.fastPeriod = fastPeriod;
    this.slowPeriod = slowPeriod;
    this.state = {
      emaFast: 0,
      emaSlow: 0,
      realizedVol: 0,
      refPrice: 0,
      tickCount: 0,
      priceHistory: []
    };
  }

  public update(price: number, volume: number = 0) {
    if (price <= 0 || isNaN(price)) return;

    this.state.tickCount++;
    this.state.priceHistory.push(price);
    if (this.state.priceHistory.length > 100) {
      this.state.priceHistory.shift();
    }

    // Initialize or update EMAs
    if (this.state.tickCount === 1) {
      this.state.emaFast = price;
      this.state.emaSlow = price;
    } else {
      const alphaFast = 2 / (this.fastPeriod + 1);
      const alphaSlow = 2 / (this.slowPeriod + 1);
      this.state.emaFast = price * alphaFast + this.state.emaFast * (1 - alphaFast);
      this.state.emaSlow = price * alphaSlow + this.state.emaSlow * (1 - alphaSlow);

      // Log returns calculation
      const logReturn = Math.log(price / this.lastPrice);
      this.logReturns.push(logReturn);
      if (this.logReturns.length > 30) {
        this.logReturns.shift();
      }
    }

    this.lastPrice = price;

    // Track peak price since this signals instance was updated
    if (price > this.peakPrice) {
      this.peakPrice = price;
    }

    // Update trade volumes
    if (volume > 0) {
      this.tradeVolumes.push(volume);
      if (this.tradeVolumes.length > 20) {
        this.tradeVolumes.shift();
      }
    }

    // Compute rolling volatility
    this.state.realizedVol = this.computeRealizedVol();
  }

  public resetPeakPrice() {
    this.peakPrice = this.lastPrice;
  }

  public getPeakPrice(): number {
    return this.peakPrice;
  }

  public setReferencePrice(price: number) {
    this.state.refPrice = price;
  }

  public getReferencePrice(): number {
    return this.state.refPrice;
  }

  public getEmaFast(): number {
    return this.state.emaFast;
  }

  public getEmaSlow(): number {
    return this.state.emaSlow;
  }

  public getRealizedVol(): number {
    return this.state.realizedVol;
  }

  public getTickCount(): number {
    return this.state.tickCount;
  }

  public getPriceHistory(): number[] {
    return this.state.priceHistory;
  }

  // Volume Momentum Indicator: volume is rising if current rolling volume avg > previous
  public isVolumeRising(): boolean {
    if (this.tradeVolumes.length < 4) return true; // Default to true if not enough volume ticks
    const mid = Math.floor(this.tradeVolumes.length / 2);
    const firstHalf = this.tradeVolumes.slice(0, mid);
    const secondHalf = this.tradeVolumes.slice(mid);
    const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    return avgSecond > avgFirst;
  }

  // Reversal Detection: if price drops from peak by 3% or EMA fast crosses below EMA slow (after stabilization)
  public isReversalDetected(): boolean {
    if (this.peakPrice <= 0) return false;
    const dropPct = (this.lastPrice - this.peakPrice) / this.peakPrice;
    if (dropPct <= -0.03) return true;
    if (this.state.tickCount > 5 && this.state.emaFast < this.state.emaSlow) return true;
    return false;
  }

  private computeRealizedVol(): number {
    if (this.logReturns.length < 2) return 0.05; // default vol if not enough data
    const mean = this.logReturns.reduce((sum, val) => sum + val, 0) / this.logReturns.length;
    const variance = this.logReturns.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (this.logReturns.length - 1);
    const vol = Math.sqrt(variance);
    return isNaN(vol) ? 0.05 : vol;
  }
}
