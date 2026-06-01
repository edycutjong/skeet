import { describe, test, expect, beforeEach } from 'vitest';
import { MeanReversionPredator, TradeEvent } from '../predator/predator.js';
import { Signals } from '../src/signals.js';

describe('MeanReversion Predator module tests', () => {
  let predator: MeanReversionPredator;
  let stats: Signals;

  beforeEach(() => {
    predator = new MeanReversionPredator(true);
    stats = new Signals(5, 20);
  });

  test('Disabled predator returns HOLD', () => {
    const disabledPredator = new MeanReversionPredator(false);
    expect(disabledPredator.evaluate(100, stats)).toBe('HOLD');
  });

  test('Discover hosted agents from trade events', () => {
    const events: TradeEvent[] = [
      { timestamp: 1, token_address: '0x1', tx_from: '0xAgentA', is_buy: 1, amount_in: '1', amount_out: '1', price: '1', tx_hash: 'h1' },
      { timestamp: 2, token_address: '0x1', tx_from: '0xAgentA', is_buy: 0, amount_in: '1', amount_out: '1', price: '1', tx_hash: 'h2' },
      { timestamp: 3, token_address: '0x1', tx_from: '0xAgentA', is_buy: 1, amount_in: '1', amount_out: '1', price: '1', tx_hash: 'h3' },
      { timestamp: 4, token_address: '0x1', tx_from: '0xAgentA', is_buy: 0, amount_in: '1', amount_out: '1', price: '1', tx_hash: 'h4' },
      { timestamp: 5, token_address: '0x1', tx_from: '0xAgentA', is_buy: 1, amount_in: '1', amount_out: '1', price: '1', tx_hash: 'h5' },
    ];

    predator.ingestTrades(events);
    // 0xAgentA has 3 buys and 2 sells -> discovered as hosted agent
    expect(predator.getHostedAgentsCount()).toBe(1);
  });

  test('Evaluate front-running buy and sell signals', () => {
    // Populate stats
    stats.update(100);
    stats.update(101);
    stats.update(100);
    stats.update(99);
    stats.update(100);
    
    // We register one agent to mock discovery
    const mockAgentEvent: TradeEvent[] = Array.from({ length: 5 }, (_, i) => ({
      timestamp: i,
      token_address: '0xToken',
      tx_from: '0xAgentX',
      is_buy: i % 2 === 0 ? 1 : 0,
      amount_in: '100',
      amount_out: '100',
      price: '1.0',
      tx_hash: `hash_${i}`
    }));
    
    predator.ingestTrades(mockAgentEvent);
    expect(predator.getHostedAgentsCount()).toBe(1);

    // EmaSlow = 100, realized vol = 0.05 (fallback), sigma = 5
    // buyTrigger = 100 - 1.8 * 5 = 91. 1% buffer = 91.91
    // sellTrigger = 100 + 1.8 * 5 = 109. 1% buffer = 107.91

    // price = 98.5 (close to buy trigger) -> should BUY
    expect(predator.evaluate(98.5, stats)).toBe('BUY');

    // price = 101.5 (close to sell trigger) -> should SELL
    expect(predator.evaluate(101.5, stats)).toBe('SELL');

    // price = 100 (at mean) -> should HOLD
    expect(predator.evaluate(100, stats)).toBe('HOLD');
  });

  test('ingestTrades edge cases', () => {
    const disabledPredator = new MeanReversionPredator(false);
    // Should return immediately if disabled
    disabledPredator.ingestTrades([{ timestamp: 1, token_address: '0x1', tx_from: '0xAgent', is_buy: 1, amount_in: '1', amount_out: '1', price: '1', tx_hash: 'h1' }]);
    expect(disabledPredator.getHostedAgentsCount()).toBe(0);

    // Should return if trades list is null, undefined, or empty
    predator.ingestTrades(null as any);
    predator.ingestTrades(undefined as any);
    predator.ingestTrades([]);
    expect(predator.getHostedAgentsCount()).toBe(0);

    // Should ignore trade if tx_from is missing
    const invalidTrades: TradeEvent[] = [
      { timestamp: 1, token_address: '0x1', tx_from: '', is_buy: 1, amount_in: '1', amount_out: '1', price: '1', tx_hash: 'h1' }
    ];
    predator.ingestTrades(invalidTrades);
    expect(predator.getHostedAgentsCount()).toBe(0);
  });
});
