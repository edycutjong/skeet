import { describe, test, expect, beforeAll } from "vitest";
import {
  getDb,
  saveRound,
  saveTick,
  getRounds,
  getTicks,
  getDailyPnL,
  RoundRow,
  TickRow,
} from "../src/db.js";
import Database from "better-sqlite3";

describe("Database helpers test suite", () => {
  let db: Database.Database;

  beforeAll(() => {
    // Initialize in-memory database
    db = getDb(":memory:");
  });

  test("getDb returns the initialized db instance", () => {
    const db2 = getDb();
    expect(db2).toBe(db);
  });

  test("saveRound inserts and updates round rows correctly", () => {
    const round: RoundRow = {
      game_id: "test_game_1",
      ref_price: 1.25,
      realized_vol: 0.12,
      entered: 1,
      buy_usdc: 100,
      exit_t: 120,
      pnl_usdc: 10,
      bankroll_after: 10010,
      ts: 1622548800,
    };

    saveRound(db, round);

    let rounds = getRounds(db);
    expect(rounds.length).toBe(1);
    expect(rounds[0].game_id).toBe("test_game_1");
    expect(rounds[0].ref_price).toBe(1.25);
    expect(rounds[0].pnl_usdc).toBe(10);

    // Update conflicting game_id
    const updatedRound: RoundRow = {
      ...round,
      ref_price: 1.3,
      pnl_usdc: -5,
      bankroll_after: 9995,
    };

    saveRound(db, updatedRound);

    rounds = getRounds(db);
    expect(rounds.length).toBe(1);
    expect(rounds[0].ref_price).toBe(1.3);
    expect(rounds[0].pnl_usdc).toBe(-5);
  });

  test("saveTick inserts tick rows and getTicks retrieves them in order", () => {
    const tick1: TickRow = {
      game_id: "test_game_1",
      t: 10.5,
      price: 1.26,
      reserves_usdc: 50000,
      ema_fast: 1.25,
      ema_slow: 1.24,
      action: "BUY",
      size: 100,
    };

    const tick2: TickRow = {
      game_id: "test_game_1",
      t: 5.2,
      price: 1.25,
      reserves_usdc: 50000,
      ema_fast: 1.25,
      ema_slow: 1.24,
      action: "HOLD",
      size: 0,
    };

    saveTick(db, tick1);
    saveTick(db, tick2);

    const ticks = getTicks(db, "test_game_1");
    expect(ticks.length).toBe(2);
    // Ordered by t ASC
    expect(ticks[0].t).toBe(5.2);
    expect(ticks[1].t).toBe(10.5);
  });

  test("getDailyPnL sums the PnL of rounds matching timestamp filter", () => {
    const round2: RoundRow = {
      game_id: "test_game_2",
      ref_price: 2.0,
      realized_vol: 0.05,
      entered: 1,
      buy_usdc: 200,
      exit_t: 130,
      pnl_usdc: -50,
      bankroll_after: 9945,
      ts: 1622548900,
    };

    saveRound(db, round2);

    // Summing test_game_1 (-5) + test_game_2 (-50) = -55
    const totalPnl = getDailyPnL(db, 1622548700);
    expect(totalPnl).toBe(-55);

    // Summing with timestamp after test_game_1 but before test_game_2
    const totalPnl2 = getDailyPnL(db, 1622548850);
    expect(totalPnl2).toBe(-50);

    // Summing with timestamp after both
    const totalPnl3 = getDailyPnL(db, 1622549000);
    expect(totalPnl3).toBe(0);
  });
});
