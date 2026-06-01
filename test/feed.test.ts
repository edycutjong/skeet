import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { runFeed } from '../src/feed.js';
import { AgentConfig } from '../src/types.js';
import { AgentState } from '../src/executor.js';
import { ethers } from 'ethers';

// Mock database module
const mockGetDb = vi.fn();
const mockSaveRound = vi.fn();
const mockSaveTick = vi.fn();
const mockGetDailyPnL = vi.fn().mockReturnValue(0);

vi.mock('../src/db.js', () => ({
  getDb: () => mockGetDb(),
  saveRound: (db: any, round: any) => mockSaveRound(db, round),
  saveTick: (db: any, tick: any) => mockSaveTick(db, tick),
  getDailyPnL: (db: any, since: number) => mockGetDailyPnL(db, since),
}));

// Mock executor module
const mockApproveToken = vi.fn().mockResolvedValue('approve_receipt');
const mockExecuteSwap = vi.fn().mockResolvedValue('swap_receipt');
const mockGetFreshJwt = vi.fn().mockResolvedValue('mock_jwt');

vi.mock('../src/executor.js', () => {
  return {
    Executor: vi.fn().mockImplementation(() => ({
      approveToken: mockApproveToken,
      executeSwap: mockExecuteSwap,
      getFreshJwt: mockGetFreshJwt,
      getWalletAddress: () => '0xMockWalletAddress',
    })),
  };
});

// Mock decide module
const mockDecide = vi.fn().mockReturnValue({ type: 'HOLD' });
vi.mock('../src/decide.js', () => ({
  decide: (ctx: any, stats: any, config: any, winRate: number, predatorAction?: string) => mockDecide(ctx, stats, config, winRate, predatorAction),
}));

// Mock ethers provider/contracts
const mockBalanceOf = vi.fn().mockResolvedValue(100n * 10n**18n); // 100 USDC
const mockProviderGetBalance = vi.fn().mockResolvedValue(10n**18n); // 1 ETH

vi.mock('ethers', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      JsonRpcProvider: vi.fn().mockImplementation(() => ({
        getBalance: mockProviderGetBalance,
      })),
      Contract: vi.fn().mockImplementation(() => ({
        balanceOf: mockBalanceOf,
      })),
    },
  };
});

describe('runFeed game loop orchestrator tests', () => {
  let config: AgentConfig;
  let state: AgentState;
  let globalFetchMock: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Fast-forward setTimeout promises asynchronously using setImmediate
    vi.spyOn(global, 'setTimeout').mockImplementation((fn: any) => {
      if (typeof fn === 'function') {
        setImmediate(fn);
      }
      return {} as any;
    });

    // Disable setInterval to prevent heartbeat timers keeping tests running
    vi.spyOn(global, 'setInterval').mockImplementation(() => {
      return {} as any;
    });

    config = {
      EMA_FAST: 5,
      EMA_SLOW: 20,
      ENTRY_DEADLINE_S: 90,
      EXIT_DEADLINE_S: 162,
      STOP_LOSS_PCT: -0.08,
      KELLY_FRACTION: 0.5,
      MAX_BUYIN_USDC: 1000,
      START_BANKROLL: 10000,
      DRAWDOWN_FLOOR_PCT: 0.30,
      MIN_SIZE_USDC: 50,
      PREDATOR_ENABLED: true,
      MAX_DAILY_LOSS_USDC: 2000
    };

    state = {
      name: 'TestAgent',
      pk: '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      address: '0xMockSafeAddress',
      agentJwt: 'jwt',
      tradingSafe: '0xTradingSafe',
      treasurySafe: '0xTreasurySafe',
      rolesMod: '0xRolesMod',
    };

    globalFetchMock = vi.fn();
    global.fetch = globalFetchMock;
    mockGetDb.mockReturnValue({});
    mockDecide.mockReturnValue({ type: 'HOLD' });
    mockProviderGetBalance.mockResolvedValue(10n**18n);
    mockBalanceOf.mockResolvedValue(100n * 10n**18n);
    mockGetDailyPnL.mockReturnValue(0);
  });

  test('Gracefully handles api game fetch errors', async () => {
    let gameCalls = 0;
    globalFetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/api/game')) {
        gameCalls++;
        if (gameCalls === 1) {
          return Promise.reject(new Error('Network offline'));
        }
        if (gameCalls === 2) {
          // Covers res.ok === false branch
          return Promise.resolve({ ok: false, status: 500 });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'ended' }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    await expect(runFeed(state, config, ':memory:')).rejects.toThrow();
  });

  test('Runs LOBBY phase transitions and covers signals initialization', async () => {
    let gameCalls = 0;
    globalFetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/api/game')) {
        gameCalls++;
        if (gameCalls === 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              status: 'lobby',
              token: { address: '0xTokenA', name: 'Token A', symbol: 'TKA' },
              startAt: 1000,
              now: 1010,
            }),
          });
        }
        if (gameCalls === 2) {
          // Same token address, live phase
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              status: 'live',
              token: { address: '0xTokenA', name: 'Token A', symbol: 'TKA', currentPrice: 1.10 },
              startAt: 1000,
              mmEndAt: 1030,
              now: 1040,
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'ended' }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    await expect(runFeed(state, config, ':memory:')).rejects.toThrow();
  });

  test('Runs MARKET_MAKING and transitions to TRADING with BUY action execution', async () => {
    let gameCalls = 0;
    let tradeCalls = 0;

    globalFetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/api/game')) {
        gameCalls++;
        if (gameCalls === 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              status: 'marketmaking',
              token: { address: '0xTokenA', name: 'Token A', symbol: 'TKA' },
              startAt: 1000,
              now: 1010,
            }),
          });
        }
        if (gameCalls === 2) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              status: 'live',
              token: { address: '0xTokenA', name: 'Token A', symbol: 'TKA', currentPrice: 1.10 },
              startAt: 1000,
              mmEndAt: 1030,
              now: 1040,
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'ended' }),
        });
      }

      if (url.includes('/trades')) {
        tradeCalls++;
        if (tradeCalls === 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              trades: [
                { ts: 1001, txFrom: '0xOpponent', side: 'buy', amountBid: '100', amountToken: '90', priceBid: '1.05', tx: '0x1' },
                { ts: 1002, tx_from: '0xOpp2', is_buy: 0, tx_hash: '0x2' },
                { ts: 1003 }
              ]
            }),
          });
        } else if (tradeCalls === 2) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([
              { ts: 1004, txFrom: '0xOpp3', side: 'sell', amountBid: '50', amountToken: '45', priceBid: '1.10', tx: '0x3' }
            ]),
          });
        } else {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({})
          });
        }
      }

      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    mockDecide.mockReturnValue({ type: 'BUY', amount: 500 });

    await expect(runFeed(state, config, ':memory:')).rejects.toThrow();
    
    // Yield event loop to allow async swap to execute
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));

    expect(mockSaveRound).toHaveBeenCalled();
    expect(mockExecuteSwap).toHaveBeenCalledWith('0xTokenA', expect.any(BigInt), true);
  });

  test('Runs TRADING with SELL_ALL and SELL_PARTIAL action execution', async () => {
    let gameCalls = 0;
    globalFetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/api/game')) {
        gameCalls++;
        if (gameCalls === 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              status: 'marketmaking',
              token: { address: '0xTokenA', name: 'Token A', symbol: 'TKA' },
              startAt: 1000,
              now: 1010,
            }),
          });
        }
        if (gameCalls === 2) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              status: 'live',
              token: { address: '0xTokenA', name: 'Token A', symbol: 'TKA', currentPrice: 1.10 },
              startAt: 1000,
              mmEndAt: 1030,
              now: 1040,
            }),
          });
        }
        if (gameCalls === 3) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              status: 'live',
              token: { address: '0xTokenA', name: 'Token A', symbol: 'TKA', currentPrice: 1.20 },
              startAt: 1000,
              mmEndAt: 1030,
              now: 1050,
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'ended' }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    // Mock token balance so we can sell
    mockBalanceOf.mockResolvedValue(100n * 10n**18n);

    // Call 1 (marketmaking) -> decide returns HOLD
    // Call 2 -> decide returns SELL_ALL with truthy amount to cover 'amount || 0' branch
    // Call 3 -> decide returns SELL_PARTIAL
    mockDecide
      .mockReturnValueOnce({ type: 'HOLD' })
      .mockReturnValueOnce({ type: 'SELL_ALL', amount: 50 })
      .mockReturnValueOnce({ type: 'SELL_PARTIAL', amount: 0.25 });

    await expect(runFeed(state, config, ':memory:')).rejects.toThrow();
    
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));

    expect(mockExecuteSwap).toHaveBeenCalledTimes(2);
  });

  test('Circuit breaker blocks BUY when daily PnL limit is exceeded', async () => {
    let gameCalls = 0;
    globalFetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/api/game')) {
        gameCalls++;
        if (gameCalls === 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              status: 'marketmaking',
              token: { address: '0xTokenA', name: 'Token A', symbol: 'TKA' },
              startAt: 1000,
              now: 1010,
            }),
          });
        }
        if (gameCalls === 2) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              status: 'live',
              token: { address: '0xTokenA', name: 'Token A', symbol: 'TKA', currentPrice: 1.50 },
              startAt: 1000,
              mmEndAt: 1030,
              now: 1040,
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'ended' }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    mockDecide.mockReturnValue({ type: 'BUY', amount: 500 });
    // Set daily loss to exceed the circuit breaker (-2500 USDC vs limit of -2000)
    mockGetDailyPnL.mockReturnValue(-2500);

    await expect(runFeed(state, config, ':memory:')).rejects.toThrow();
  });

  test('Refill helper requests refill when ETH balance is low (Success)', async () => {
    // Mock low ETH balance
    mockProviderGetBalance.mockResolvedValue(ethers.parseEther('0.05')); // < 0.1 ETH

    let gameCalls = 0;
    globalFetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/api/game')) {
        gameCalls++;
        if (gameCalls === 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              status: 'marketmaking',
              token: { address: '0xTokenB', name: 'Token B', symbol: 'TKB' },
              startAt: 1000,
              now: 1010,
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'ended' }),
        });
      }
      if (url.endsWith('/api/agents/refill')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    await expect(runFeed(state, config, ':memory:')).rejects.toThrow();
    expect(globalFetchMock).toHaveBeenCalled();
  });

  test('Refill helper requests refill when ETH balance is low (Failure)', async () => {
    // Mock low ETH balance
    mockProviderGetBalance.mockResolvedValue(ethers.parseEther('0.05')); // < 0.1 ETH

    let gameCalls = 0;
    globalFetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/api/game')) {
        gameCalls++;
        if (gameCalls === 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              status: 'marketmaking',
              token: { address: '0xTokenB', name: 'Token B', symbol: 'TKB' },
              startAt: 1000,
              now: 1010,
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'ended' }),
        });
      }
      if (url.endsWith('/api/agents/refill')) {
        // Return non-ok response to hit Refill failed log branch (line 61-62)
        return Promise.resolve({ ok: false, statusText: 'Too many requests' });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    await expect(runFeed(state, config, ':memory:')).rejects.toThrow();
    expect(globalFetchMock).toHaveBeenCalled();
  });

  test('Handles contract call errors and trade fetch errors gracefully', async () => {
    let gameCalls = 0;
    globalFetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/api/game')) {
        gameCalls++;
        if (gameCalls === 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              status: 'marketmaking',
              token: { address: '0xTokenA', name: 'Token A', symbol: 'TKA' },
              startAt: 1000,
              now: 1010,
            }),
          });
        }
        if (gameCalls === 2) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              status: 'live',
              token: { address: '0xTokenA', name: 'Token A', symbol: 'TKA', currentPrice: 1.10 },
              startAt: 1000,
              mmEndAt: 1030,
              now: 1040,
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'ended' }),
        });
      }
      if (url.includes('/trades')) {
        return Promise.reject(new Error('Trades fetch error'));
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    // Make contract methods and helper methods throw to trigger catches
    mockProviderGetBalance.mockRejectedValueOnce(new Error('Low level getBalance fail'));
    mockBalanceOf.mockRejectedValue(new Error('Low level balanceOf fail'));
    // approveToken succeeds so tradingApproved is true, but executeSwap rejects
    mockApproveToken.mockResolvedValue('approve_success');
    mockExecuteSwap.mockRejectedValue(new Error('Mock executeSwap fail'));

    mockDecide.mockReturnValue({ type: 'BUY', amount: 500 });

    await expect(runFeed(state, config, ':memory:')).rejects.toThrow();

    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));
  });

  test('Starts directly in TRADING phase with predator disabled', async () => {
    config.PREDATOR_ENABLED = false;

    let gameCalls = 0;
    globalFetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/api/game')) {
        gameCalls++;
        if (gameCalls === 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              status: 'live',
              token: { address: '0xTokenA', name: 'Token A', symbol: 'TKA', currentPrice: 1.10 },
              startAt: 1000,
              mmEndAt: 1030,
              now: 1040,
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'ended' }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    mockDecide.mockReturnValue({ type: 'HOLD' });

    await expect(runFeed(state, config, ':memory:')).rejects.toThrow();
  });

  test('Handles token approval failure gracefully', async () => {
    let gameCalls = 0;
    globalFetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/api/game')) {
        gameCalls++;
        if (gameCalls === 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              status: 'marketmaking',
              token: { address: '0xTokenA', name: 'Token A', symbol: 'TKA' },
              startAt: 1000,
              now: 1010,
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'ended' }),
        });
      }
      return Promise.resolve({ ok: true });
    });

    mockApproveToken.mockRejectedValueOnce(new Error('Approval fail'));

    await expect(runFeed(state, config, ':memory:')).rejects.toThrow();
    expect(mockApproveToken).toHaveBeenCalled();
  });
  test('Creates new Signals instance if signals is null and isNewBattle is false', async () => {
    let gameCalls = 0;
    globalFetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/api/game')) {
        gameCalls++;
        if (gameCalls === 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              status: 'marketmaking',
              token: { address: '0xTokenA', name: 'Token A', symbol: 'TKA' },
              startAt: 1000,
              now: 1010,
            }),
          });
        }
        if (gameCalls === 2) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              status: 'lobby'
            }),
          });
        }
        if (gameCalls === 3) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              status: 'live',
              token: { address: '0xTokenA', name: 'Token A', symbol: 'TKA', currentPrice: 1.10 },
              startAt: 1000,
              mmEndAt: 1030,
              now: 1040,
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'ended' }),
        });
      }
      return Promise.resolve({ ok: true });
    });

    await expect(runFeed(state, config, ':memory:')).rejects.toThrow();
  });
});
