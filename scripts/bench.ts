import { performance } from 'perf_hooks';
import { decide } from '../src/decide.js';
import { Signals } from '../src/signals.js';
import { AgentConfig, GameContext } from '../src/types.js';

const mockConfig: AgentConfig = {
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
  PREDATOR_ENABLED: false,
  MAX_DAILY_LOSS_USDC: 2000
};

function runBenchmark() {
  const iterations = 1000;
  const latencies: number[] = [];
  const stats = new Signals(5, 20);

  // Seed signals
  for (let i = 0; i < 50; i++) {
    stats.update(100 + Math.sin(i) * 5, 10 + i);
  }
  stats.setReferencePrice(100);

  const ctx: GameContext = {
    phase: "TRADING",
    t: 45,
    price: 105,
    reserves: 50000,
    position: 0,
    entryPrice: 0,
    bankroll: 10000,
    peakBankroll: 10000
  };

  for (let i = 0; i < iterations; i++) {
    // Modify ctx slightly to prevent optimization caching
    ctx.t = 30 + (i % 60);
    ctx.price = 100 + Math.sin(i) * 10;
    
    const start = performance.now();
    decide(ctx, stats, mockConfig);
    const end = performance.now();
    
    latencies.push(end - start);
  }

  // Sort to compute percentiles
  latencies.sort((a, b) => a - b);

  const min = latencies[0];
  const max = latencies[latencies.length - 1];
  const mean = latencies.reduce((sum, val) => sum + val, 0) / latencies.length;
  const p50 = latencies[Math.floor(latencies.length * 0.50)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];

  console.log('==================================================');
  console.log('           SKEET decide() LATENCY BENCHMARK        ');
  console.log('==================================================');
  console.log(`Iterations : ${iterations}`);
  console.log(`Min        : ${min.toFixed(4)} ms`);
  console.log(`Max        : ${max.toFixed(4)} ms`);
  console.log(`Mean       : ${mean.toFixed(4)} ms`);
  console.log(`p50        : ${p50.toFixed(4)} ms`);
  console.log(`p95        : ${p95.toFixed(4)} ms`);
  console.log('--------------------------------------------------');
  
  if (p95 < 100) {
    console.log('✅ BENCHMARK PASSED (p95 latency is under 100ms)');
  } else {
    console.error('❌ BENCHMARK FAILED (p95 latency is over 100ms)');
    process.exit(1);
  }
  console.log('==================================================');
}

runBenchmark();
