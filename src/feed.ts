import { ethers } from 'ethers';
import { Executor, AgentState } from './executor.js';
import { Signals } from './signals.js';
import { decide } from './decide.js';
import { getDb, saveRound, saveTick, getDailyPnL, RoundRow } from './db.js';
import { AgentConfig, GameContext } from './types.js';
import fs from 'fs';
import { MeanReversionPredator } from '../predator/predator.js';

const USDC_ADDRESS = '0xed38c197b319fdc067f4c3fb58eec1a733a36cf4';
const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
];

export async function runFeed(
  state: AgentState,
  config: AgentConfig,
  dbPath: string = 'skeet.sqlite'
) {
  const db = getDb(dbPath);
  const provider = new ethers.JsonRpcProvider('http://5.161.35.78:8545', 42069, { staticNetwork: true });
  const executor = new Executor(state);
  const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);

  // Heartbeat ping
  const startHeartbeat = (address: string) => {
    const ping = () => fetch('https://alpha.creator.bid/api/agents/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address })
    }).catch(() => {});
    
    ping();
    setInterval(ping, 30_000);
  };
  
  startHeartbeat(state.address);

  // Refill helper
  const checkAndRefill = async (address: string) => {
    try {
      const ethBal = await provider.getBalance(address);
      
      // If ETH is low (< 0.1 ETH)
      if (ethBal < ethers.parseEther('0.1')) {
        console.log(`[FEED] Balance low (ETH: ${ethers.formatEther(ethBal)}). Requesting refill...`);
        const token = await executor.getFreshJwt();
        const res = await fetch('https://alpha.creator.bid/api/agents/refill', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ address })
        });
        if (res.ok) {
          console.log('[FEED] Refill requested successfully');
          await new Promise(r => setTimeout(r, 5000)); // wait for confirmations
        } else {
          console.error(`[FEED] Refill failed: ${res.statusText}`);
        }
      }
    } catch (e: any) {
      console.error('[FEED] Refill check failed:', e.message);
    }
  };


  let lastTokenAddress = '';
  let signals: Signals | null = null;
  let entryPrice = 0;
  let peakBankroll = config.START_BANKROLL;
  let currentRoundId = '';
  let tradingApproved = false;
  let tradeInFlight = false;
  let initialBankrollCalculated = false;
  let predator = new MeanReversionPredator(config.PREDATOR_ENABLED);


  console.log('[FEED] Starting game loop...');

  while (true) {
    let game;
    try {
      const res = await fetch('https://alpha.creator.bid/api/game');
      if (!res.ok) throw new Error(`Status ${res.status}`);
      game = await res.json();
    } catch (e: any) {
      console.error('[FEED] Error getting game status:', e.message);
      await new Promise(r => setTimeout(r, 3000));
      continue;
    }

    // Determine current phase based on game status
    let phase: "LOBBY" | "MARKET_MAKING" | "TRADING" | "ENDED" = "LOBBY";
    if (game.status === 'marketmaking') {
      phase = "MARKET_MAKING";
    } else if (game.status === 'live') {
      phase = "TRADING";
    } else if (game.status === 'ended') {
      phase = "ENDED";
    }

    if (phase === "LOBBY") {
      signals = null;
      tradingApproved = false;
      initialBankrollCalculated = false;
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }

    const tokenAddress = game.token.address;
    const isNewBattle = tokenAddress !== lastTokenAddress;

    if (isNewBattle) {
      console.log(`[FEED] New battle detected: ${game.token.name} (${game.token.symbol})`);
      lastTokenAddress = tokenAddress;
      signals = new Signals(config.EMA_FAST, config.EMA_SLOW);
      entryPrice = 0;
      tradingApproved = false;
      initialBankrollCalculated = false;
      currentRoundId = `${tokenAddress}_${game.startAt}`;
      predator = new MeanReversionPredator(config.PREDATOR_ENABLED);

      // Refill checks at start of battle
      await checkAndRefill(state.address);


      // Approve battle token
      try {
        console.log(`[FEED] Approving factory for ${game.token.symbol}...`);
        await executor.approveToken(tokenAddress);
        tradingApproved = true;
        console.log('[FEED] Factory approved successfully');
      } catch (e: any) {
        console.error('[FEED] Approval failed:', e.message);
      }

      // Initialize round row in database
      const roundRow: RoundRow = {
        game_id: currentRoundId,
        ref_price: 0,
        realized_vol: 0,
        entered: 0,
        buy_usdc: 0,
        exit_t: 0,
        pnl_usdc: 0,
        bankroll_after: config.START_BANKROLL,
        ts: game.startAt
      };
      saveRound(db, roundRow);
    }

    if (!signals) {
      signals = new Signals(config.EMA_FAST, config.EMA_SLOW);
    }

    const price = game.token.currentPrice || 0;
    signals.update(price);

    // Update reference price at MM end
    if (phase === "MARKET_MAKING") {
      signals.setReferencePrice(price);
    }

    // Get balances (Sum trading Safe + treasury Safe USDC for total bankroll)
    let tradingUsdc = 0n;
    let treasuryUsdc = 0n;
    let usdcBal = 0n;
    let tokBal = 0n;
    try {
      tradingUsdc = await usdcContract.balanceOf(state.tradingSafe);
      treasuryUsdc = await usdcContract.balanceOf(state.treasurySafe);
      usdcBal = tradingUsdc + treasuryUsdc;
      tokBal = await new ethers.Contract(tokenAddress, ERC20_ABI, provider).balanceOf(state.tradingSafe);
    } catch (e: any) {
      // fallback if provider call fails
    }

    const usdcBalNum = parseFloat(ethers.formatUnits(usdcBal, 18));
    const tokBalNum = parseFloat(ethers.formatUnits(tokBal, 18));

    // Simple bankroll logic: cash + position value
    const currentBankroll = usdcBalNum + (tokBalNum * price);

    if (!initialBankrollCalculated && currentBankroll > 0) {
      peakBankroll = Math.max(peakBankroll, currentBankroll);
      initialBankrollCalculated = true;
    }

    // Calculate time t
    let t = 0;
    if (phase === "TRADING" && game.mmEndAt) {
      t = game.now - game.mmEndAt;
    } else {
      t = game.now - game.startAt;
    }

    // Volatility reserves
    let reservesUsdc = 0;
    try {
      const reserves = await usdcContract.balanceOf(game.token.pool);
      reservesUsdc = parseFloat(ethers.formatUnits(reserves, 18));
    } catch {}

    const ctx: GameContext = {
      phase,
      t,
      price,
      reserves: reservesUsdc,
      position: tokBalNum,
      bankroll: currentBankroll > 0 ? currentBankroll : config.START_BANKROLL,
      peakBankroll,
      entryPrice
    };

    // Ingest trades if predator is enabled
    if (config.PREDATOR_ENABLED) {
      try {
        const resTrades = await fetch(`https://alpha.creator.bid/api/tokens/${tokenAddress}/trades`);
        if (resTrades.ok) {
          const tradesData = await resTrades.json();
          const tradesArray = Array.isArray(tradesData) ? tradesData : (tradesData.trades || []);
          const mappedTrades = tradesArray.map((t: any) => ({
            timestamp: t.ts,
            token_address: tokenAddress,
            tx_from: t.txFrom || t.tx_from,
            is_buy: t.side === 'buy' ? 1 : (t.is_buy || 0),
            amount_in: String(t.amountBid || ''),
            amount_out: String(t.amountToken || ''),
            price: String(t.priceBid || ''),
            tx_hash: t.tx || t.tx_hash
          }));
          predator.ingestTrades(mappedTrades);
        }
      } catch (e: any) {
        console.error('[FEED] Failed to fetch trades for predator:', e.message);
      }
    }

    const predatorAction = config.PREDATOR_ENABLED 
      ? predator.evaluate(price, signals) 
      : 'HOLD';

    // Make trading decision
    const action = decide(ctx, signals, config, 0.55, predatorAction);

    console.log(`[FEED] Tick t=${t.toFixed(1)} | Price: ${price.toFixed(4)} | Safe: ${parseFloat(ethers.formatUnits(tradingUsdc, 18)).toFixed(2)} USDC | Treasury: ${parseFloat(ethers.formatUnits(treasuryUsdc, 18)).toFixed(2)} USDC | Bankroll: ${currentBankroll.toFixed(2)} USDC | Action: ${action.type}`);

    // Circuit Breaker check: calculate PnL over the last 24 hours
    const sinceTimestamp = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
    const dailyPnL = getDailyPnL(db, sinceTimestamp);
    if (dailyPnL <= -config.MAX_DAILY_LOSS_USDC) {
      if (action.type === "BUY") {
        console.warn(`[CIRCUIT BREAKER] BUY blocked: 24h loss of ${dailyPnL.toFixed(2)} USDC exceeds limit of -${config.MAX_DAILY_LOSS_USDC} USDC`);
        action.type = "HOLD";
        action.amount = 0;
      }
    }

    // Save tick to DB
    saveTick(db, {
      game_id: currentRoundId,
      t,
      price,
      reserves_usdc: reservesUsdc,
      ema_fast: signals.getEmaFast(),
      ema_slow: signals.getEmaSlow(),
      action: action.type,
      size: action.amount || 0
    });

    if (action.type !== "HOLD" && !tradeInFlight && tradingApproved) {
      tradeInFlight = true;
      (async () => {
        try {
          if (action.type === "BUY" && action.amount) {
            const buyAmountWei = ethers.parseUnits(action.amount.toFixed(6), 18);
            console.log(`[FEED] BUYing ${action.amount} USDC worth of ${game.token.symbol}`);
            await executor.executeSwap(tokenAddress, buyAmountWei, true);
            entryPrice = price;
            signals?.resetPeakPrice();
            
            // Update round log
            saveRound(db, {
              game_id: currentRoundId,
              ref_price: signals?.getReferencePrice() || 0,
              realized_vol: signals?.getRealizedVol() || 0,
              entered: 1,
              buy_usdc: action.amount,
              exit_t: 0,
              pnl_usdc: 0,
              bankroll_after: currentBankroll,
              ts: game.startAt
            });
          } else if (action.type === "SELL_ALL" && tokBal > 0n) {
            console.log(`[FEED] SELLING ALL ${ethers.formatUnits(tokBal, 18)} tokens of ${game.token.symbol}`);
            await executor.executeSwap(tokenAddress, tokBal, false);
            const pnl = currentBankroll - peakBankroll;
            entryPrice = 0;

            saveRound(db, {
              game_id: currentRoundId,
              ref_price: signals!.getReferencePrice(),
              realized_vol: signals!.getRealizedVol(),
              entered: 1,
              buy_usdc: action.amount!,
              exit_t: t,
              pnl_usdc: pnl,
              bankroll_after: currentBankroll,
              ts: game.startAt
            });
          } else if (action.type === "SELL_PARTIAL" && tokBal > 0n && action.amount) {
            const sellAmount = (tokBal * BigInt(Math.floor(action.amount * 100))) / 100n;
            console.log(`[FEED] SELLING PARTIAL ${ethers.formatUnits(sellAmount, 18)} tokens of ${game.token.symbol}`);
            await executor.executeSwap(tokenAddress, sellAmount, false);
          }
        } catch (e: any) {
          console.error('[FEED] Trade execution failed:', e.message);
        } finally {
          tradeInFlight = false;
        }
      })();
    }

    // Sleep 1.5s
    await new Promise(r => setTimeout(r, 1500));
  }
}
