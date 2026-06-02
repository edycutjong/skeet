# 🎬 Skeet — Telemetry Demo Guide

Follow these steps to demonstrate Skeet's momentum strategy, Kelly-based capital preservation, and front-running exit mechanics.

---

## Step 1: Install & Set Up Env
Create a `.env` file containing the access code from Telegram:
```env
BID_ACCESS_CODE=your_access_code_here   # request yours from the Creatorbid Telegram
```

Run installation:
```bash
npm install
cd dashboard && npm install && cd ..
```

---

## Step 2: Verify Safety & Performance (Offline)
Run the verification scripts to prove performance under zero-network constraints:

### 1. Run Unit Tests
```bash
npm test
```
*Expected Output:*
```
✓ test/db.test.ts (4 tests)
✓ test/predator.test.ts (4 tests)
✓ test/risk.test.ts (49 tests)
✓ test/signals.test.ts (15 tests)
✓ test/decide.test.ts (64 tests)
✓ test/executor.test.ts (11 tests)
✓ test/feed.test.ts (12 tests)

Test Files  7 passed (7)
     Tests  159 passed (159)
```

### 2. Run Offline Verification
```bash
npm run verify-offline
```
*Expected Output:*
```
==================================================
       SKEET OFFLINE SAFETY VERIFICATION          
==================================================
[t=31] Executed BUY of 500.00 USDC at price 100.50
[t=129] Executed SELL_ALL (Value: 455.22 USDC) at price 91.50
--------------------------------------------------
✅ verification passed:
   - Exit deadline respected: closed at second 99 (limit: 162)
   - Position sizing capped under 1000 USDC
   - Bankroll remained positive
==================================================
```

### 3. Run Strategy Backtest
```bash
npm run backtest
```
*Expected Output:*
```
Round 01 | Skeet PnL:   638.89 USDC | MeanReversion PnL:     0.00 USDC
Round 02 | Skeet PnL:     0.00 USDC | MeanReversion PnL:  -378.82 USDC
...
TOTALS   | Skeet PnL:  2582.75 USDC | MeanReversion PnL: -1396.61 USDC
==================================================
✅ BACKTEST PASSED: Skeet outperforms MeanReversion!
==================================================
```

---

## Step 3: Start the Daemon & Live Dashboard
Launch the trading process and open the telemetry cockpit:

1. **Start the daemon:**
   ```bash
   npm start
   ```
   *Expected Output:*
   ```
   [INDEX] Generated Signer EOA Address: 0x...
   [INDEX] Agent registered successfully! Trading Safe: 0x...
   [INDEX] Launching Skeet Daemon...
   [FEED] Starting game loop...
   [FEED] New battle detected: Frost Vault 671 (FROSTVAULT)
   [FEED] Approving factory...
   [FEED] Factory approved successfully
   ```

2. **Launch the Next.js Dashboard:**
   ```bash
   cd dashboard
   npm run dev
   ```
   *Expected Output:*
   ```
   ▲ Next.js 16.2.6
   - Local: http://localhost:3000
   ```

Open `http://localhost:3000` to inspect live round pricing charts, transaction execution lines, and cumulative PnL metrics.
