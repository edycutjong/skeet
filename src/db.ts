import Database from 'better-sqlite3';
import path from 'path';

let dbInstance: Database.Database | null = null;

export function getDb(dbPath: string = 'skeet.sqlite'): Database.Database {
  if (!dbInstance) {
    dbInstance = new Database(dbPath);
    dbInstance.pragma('journal_mode = WAL');
    initDb(dbInstance);
  }
  return dbInstance;
}

function initDb(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rounds (
      game_id        TEXT PRIMARY KEY,
      ref_price      REAL,
      realized_vol   REAL,
      entered        INTEGER,      -- 0/1 (selective entry)
      buy_usdc       REAL,
      exit_t         REAL,         -- second of full exit
      pnl_usdc       REAL,
      bankroll_after REAL,
      ts             INTEGER
    );

    CREATE TABLE IF NOT EXISTS ticks (
      game_id       TEXT,
      t             REAL,
      price         REAL,
      reserves_usdc REAL,
      ema_fast      REAL,
      ema_slow      REAL,
      action        TEXT,
      size          REAL,
      FOREIGN KEY(game_id) REFERENCES rounds(game_id)
    );
  `);
}

export interface RoundRow {
  game_id: string;
  ref_price: number;
  realized_vol: number;
  entered: number;
  buy_usdc: number;
  exit_t: number;
  pnl_usdc: number;
  bankroll_after: number;
  ts: number;
}

export interface TickRow {
  game_id: string;
  t: number;
  price: number;
  reserves_usdc: number;
  ema_fast: number;
  ema_slow: number;
  action: string;
  size: number;
}

export function saveRound(db: Database.Database, round: RoundRow) {
  const stmt = db.prepare(`
    INSERT INTO rounds (game_id, ref_price, realized_vol, entered, buy_usdc, exit_t, pnl_usdc, bankroll_after, ts)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(game_id) DO UPDATE SET
      ref_price = excluded.ref_price,
      realized_vol = excluded.realized_vol,
      entered = excluded.entered,
      buy_usdc = excluded.buy_usdc,
      exit_t = excluded.exit_t,
      pnl_usdc = excluded.pnl_usdc,
      bankroll_after = excluded.bankroll_after,
      ts = excluded.ts
  `);
  stmt.run(
    round.game_id,
    round.ref_price,
    round.realized_vol,
    round.entered,
    round.buy_usdc,
    round.exit_t,
    round.pnl_usdc,
    round.bankroll_after,
    round.ts
  );
}

export function saveTick(db: Database.Database, tick: TickRow) {
  const stmt = db.prepare(`
    INSERT INTO ticks (game_id, t, price, reserves_usdc, ema_fast, ema_slow, action, size)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    tick.game_id,
    tick.t,
    tick.price,
    tick.reserves_usdc,
    tick.ema_fast,
    tick.ema_slow,
    tick.action,
    tick.size
  );
}

export function getRounds(db: Database.Database): RoundRow[] {
  return db.prepare('SELECT * FROM rounds ORDER BY ts DESC').all() as RoundRow[];
}

export function getTicks(db: Database.Database, gameId: string): TickRow[] {
  return db.prepare('SELECT * FROM ticks WHERE game_id = ? ORDER BY t ASC').all(gameId) as TickRow[];
}
