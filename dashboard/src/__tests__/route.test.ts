import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '../app/api/data/route';
import fs from 'fs';
import Database from 'better-sqlite3';

// Get actual better-sqlite3 constructor using importActual to bypass our mock
const { default: ActualDatabase } = await vi.importActual<{ default: typeof Database }>('better-sqlite3');

// Mock fs.existsSync
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
  },
}));

// Mock next/server
vi.mock('next/server', () => {
  return {
    NextResponse: {
      json: (body: unknown, init?: ResponseInit) => {
        const response = new Response(JSON.stringify(body), init);
        Object.defineProperty(response, 'json', {
          value: async () => body,
          writable: true
        });
        return response;
      },
    },
  };
});

let memoryDb: Database.Database;
let shouldThrowQueryError = false;

// Mock better-sqlite3 constructor
vi.mock('better-sqlite3', () => {
  return {
    default: vi.fn().mockImplementation(() => {
      if (shouldThrowQueryError) {
        return {
          prepare: () => {
            throw new Error('SQLite query failure');
          },
          close: vi.fn(),
        };
      }
      return memoryDb;
    }),
  };
});

describe('GET /api/data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldThrowQueryError = false;
    
    // Create actual in-memory database using the unmocked constructor
    memoryDb = new ActualDatabase(':memory:');
    
    // Set up database schema
    memoryDb.exec(`
      CREATE TABLE IF NOT EXISTS rounds (
        game_id TEXT PRIMARY KEY,
        ref_price REAL,
        realized_vol REAL,
        entered INTEGER,
        buy_usdc REAL,
        exit_t INTEGER,
        pnl_usdc REAL,
        bankroll_after REAL,
        ts INTEGER
      );
      CREATE TABLE IF NOT EXISTS ticks (
        game_id TEXT,
        t REAL,
        price REAL,
        reserves_usdc REAL,
        ema_fast REAL,
        ema_slow REAL,
        action TEXT,
        size REAL
      );
    `);
  });

  afterEach(() => {
    if (memoryDb && typeof memoryDb.close === 'function') {
      memoryDb.close();
    }
  });

  it('should return empty rounds and ticks when database does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      rounds: [],
      ticks: [],
      connected: false,
    });
  });

  it('should query rounds and ticks when database exists', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    
    // Insert mock data using real SQLite
    memoryDb.prepare(`
      INSERT INTO rounds (game_id, ref_price, realized_vol, entered, buy_usdc, exit_t, pnl_usdc, bankroll_after, ts)
      VALUES ('frostvault_1', 1.25, 0.12, 1, 100, 120, 10.0, 10010.0, 1622548800)
    `).run();

    memoryDb.prepare(`
      INSERT INTO ticks (game_id, t, price, reserves_usdc, ema_fast, ema_slow, action, size)
      VALUES ('frostvault_1', 10.5, 1.26, 50000.0, 1.25, 1.24, 'BUY', 100.0)
    `).run();

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.connected).toBe(true);
    expect(data.rounds.length).toBe(1);
    expect(data.rounds[0].game_id).toBe('frostvault_1');
    expect(data.ticks.length).toBe(1);
    expect(data.ticks[0].price).toBe(1.26);
  });

  it('should return 500 when database connection fails (db is null)', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    
    // Make the mocked constructor throw an error directly (so db is null)
    const { default: DatabaseMock } = await import('better-sqlite3');
    vi.mocked(DatabaseMock).mockImplementationOnce(() => {
      throw new Error('SQLite connection failure');
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.connected).toBe(false);
    expect(data.error).toBe('SQLite connection failure');
  });

  it('should return 500 and close db when database query fails (db is not null)', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    shouldThrowQueryError = true;

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.connected).toBe(false);
    expect(data.error).toBe('SQLite query failure');
  });

  it('should return 500 when database throws a non-Error string', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    
    const { default: DatabaseMock } = await import('better-sqlite3');
    vi.mocked(DatabaseMock).mockImplementationOnce(() => {
      throw 'Raw string exception';
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.connected).toBe(false);
    expect(data.error).toBe('Raw string exception');
  });
});
