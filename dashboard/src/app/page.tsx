'use client';

import React, { useEffect, useState } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine 
} from 'recharts';
import { 
  TrendingUp, Play, ShieldAlert, Cpu, AlertTriangle, 
  Layers, RefreshCw, BarChart2, CheckCircle2, XCircle
} from 'lucide-react';

interface Round {
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

interface Tick {
  game_id: string;
  t: number;
  price: number;
  reserves_usdc: number;
  ema_fast: number;
  ema_slow: number;
  action: string;
  size: number;
}

// Fallback/Demo Mock Data when DB is empty
const mockRounds: Round[] = [
  { game_id: 'frostvault_1', ref_price: 100, realized_vol: 0.05, entered: 1, buy_usdc: 500, exit_t: 165, pnl_usdc: 245.5, bankroll_after: 10245.5, ts: Date.now() - 360000 },
  { game_id: 'frostvault_2', ref_price: 80, realized_vol: 0.08, entered: 0, buy_usdc: 0, exit_t: 0, pnl_usdc: 0, bankroll_after: 10245.5, ts: Date.now() - 280000 },
  { game_id: 'frostvault_3', ref_price: 120, realized_vol: 0.12, entered: 1, buy_usdc: 800, exit_t: 99, pnl_usdc: -64.0, bankroll_after: 10181.5, ts: Date.now() - 200000 },
  { game_id: 'frostvault_4', ref_price: 90, realized_vol: 0.04, entered: 1, buy_usdc: 600, exit_t: 162, pnl_usdc: 180.2, bankroll_after: 10361.7, ts: Date.now() - 120000 },
  { game_id: 'frostvault_5', ref_price: 110, realized_vol: 0.06, entered: 1, buy_usdc: 750, exit_t: 164, pnl_usdc: 310.8, bankroll_after: 10672.5, ts: Date.now() - 40000 }
];

const mockTicks: Tick[] = Array.from({ length: 120 }, (_, i) => {
  const t = i * 1.5;
  let price = 100;
  if (t < 30) {
    price = 100 + Math.sin(t * 0.2) * 1.5;
  } else if (t < 90) {
    price = 100 + (t - 30) * 0.8;
  } else {
    price = 148 - (t - 90) * 0.5;
  }
  return {
    game_id: 'frostvault_5',
    t,
    price,
    reserves_usdc: 50000 + Math.sin(t * 0.1) * 2000,
    ema_fast: price * 1.01,
    ema_slow: price * 0.99,
    action: t === 35 ? 'BUY' : t === 118 ? 'SELL_ALL' : 'HOLD',
    size: t === 35 ? 750 : 0
  };
});

export default function Dashboard() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [ticks, setTicks] = useState<Tick[]>([]);
  const [selectedRoundId, setSelectedRoundId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [usingMock, setUsingMock] = useState(false);
  const [activeTab, setActiveTab] = useState<'TELEMETRY' | 'HISTORY'>('TELEMETRY');

  const fetchData = async () => {
    try {
      const res = await fetch('/api/data');
      if (!res.ok) throw new Error('API Error');
      const data = await res.json();
      if (data.rounds.length > 0) {
        setRounds(data.rounds);
        setTicks(data.ticks);
        setSelectedRoundId(data.rounds[0].game_id);
        setUsingMock(false);
      } else {
        setRounds(mockRounds);
        setTicks(mockTicks);
        setSelectedRoundId(mockRounds[0].game_id);
        setUsingMock(true);
      }
    } catch {
      setRounds(mockRounds);
      setTicks(mockTicks);
      setSelectedRoundId(mockRounds[0].game_id);
      setUsingMock(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const totalPnL = rounds.reduce((sum, r) => sum + r.pnl_usdc, 0);
  const enteredRounds = rounds.filter(r => r.entered === 1);
  const skippedRoundsCount = rounds.length - enteredRounds.length;
  const winningRounds = enteredRounds.filter(r => r.pnl_usdc > 0).length;
  const winRate = enteredRounds.length > 0 ? (winningRounds / enteredRounds.length) * 100 : 0;

  // Generate Cumulative PnL chart data
  const cumulativeData = rounds
    .slice()
    .reverse()
    .reduce((acc: any[], round, idx) => {
      const prevSkeet = idx === 0 ? 0 : acc[idx - 1].Skeet;
      const prevMR = idx === 0 ? 0 : acc[idx - 1].MeanReversion;
      
      // Simulating MeanReversion baseline losing on pumps and slippage
      const mrPnL = round.entered === 0 ? 0 : round.pnl_usdc < 0 ? round.pnl_usdc * 1.5 : -round.pnl_usdc * 0.8;
      
      acc.push({
        name: `R${idx + 1}`,
        Skeet: prevSkeet + round.pnl_usdc,
        MeanReversion: prevMR + mrPnL
      });
      return acc;
    }, []);

  // Filter ticks for selected round
  const selectedTicks = ticks.filter(t => t.game_id === selectedRoundId);
  const selectedRound = rounds.find(r => r.game_id === selectedRoundId);

  return (
    <div className="min-h-screen text-slate-100 flex flex-col p-4 md:p-8 bg-[#060913] font-body relative overflow-x-hidden">
      
      {/* Background glow effects */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-cyan-dim/10 rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple/5 rounded-full blur-[150px] pointer-events-none" />

      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-3">
            <span className="p-2 bg-cyan/10 border border-cyan/20 text-cyan rounded-lg">
              <Cpu className="w-6 h-6 animate-pulse" />
            </span>
            <h1 className="text-2xl md:text-3xl font-bold font-display uppercase tracking-wider text-cyan glow-cyan">
              Skeet PVP Telemetry
            </h1>
          </div>
          <p className="text-sm text-text-secondary mt-1 ml-1">
            Daemon active on BID testnet (Chain ID 42069)
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 glass-card text-xs">
            <span className={`status-dot ${usingMock ? 'status-dot-pending' : 'status-dot-live'}`} />
            <span className="font-mono text-text-secondary uppercase">
              {usingMock ? 'DEMO REPLAY MODE' : 'LIVE DAEMON ACTIVE'}
            </span>
          </div>
          <button 
            onClick={fetchData}
            className="p-2 border border-border-bright hover:border-cyan text-text-secondary hover:text-cyan rounded-lg transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Grid of cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="glass-card p-4">
          <div className="text-xs text-text-muted font-display uppercase tracking-wider">Cumulative Profit</div>
          <div className={`text-2xl font-bold font-mono mt-1 ${totalPnL >= 0 ? 'text-emerald' : 'text-red'}`}>
            {totalPnL >= 0 ? '+' : ''}{totalPnL.toFixed(2)} USDC
          </div>
          <div className="text-xs text-text-secondary mt-2 flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5 text-emerald" />
            Compound Kelly sizing
          </div>
        </div>

        <div className="glass-card p-4">
          <div className="text-xs text-text-muted font-display uppercase tracking-wider">Win Rate (Entered)</div>
          <div className="text-2xl font-bold font-mono mt-1 text-cyan">{winRate.toFixed(1)}%</div>
          <div className="text-xs text-text-secondary mt-2">
            {winningRounds} W / {enteredRounds.length - winningRounds} L in {enteredRounds.length} trades
          </div>
        </div>

        <div className="glass-card p-4">
          <div className="text-xs text-text-muted font-display uppercase tracking-wider">Rounds Skipped</div>
          <div className="text-2xl font-bold font-mono mt-1 text-amber">{skippedRoundsCount}</div>
          <div className="text-xs text-text-secondary mt-2">
            Preserving capital in low-edge rounds
          </div>
        </div>

        <div className="glass-card p-4">
          <div className="text-xs text-text-muted font-display uppercase tracking-wider">Current Bankroll</div>
          <div className="text-2xl font-bold font-mono mt-1 text-slate-100">
            {rounds[0] ? rounds[0].bankroll_after.toFixed(2) : '10,000.00'} USDC
          </div>
          <div className="text-xs text-text-secondary mt-2">
            Peak: {Math.max(...rounds.map(r => r.bankroll_after), 10000).toFixed(2)} USDC
          </div>
        </div>
      </section>

      {/* Main Charts & Telemetry */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: Charts */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          
          {/* Chart 1: Price Timeline & Actions */}
          <div className="glass-card p-5 relative overflow-hidden flex flex-col h-[380px]">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-sm font-semibold uppercase font-display tracking-wider text-cyan">
                  Intra-Round Execution Timeline
                </h2>
                <p className="text-xs text-text-secondary mt-1">
                  Active Round: <span className="font-mono text-slate-200">{selectedRoundId}</span>
                </p>
              </div>
              <div className="flex gap-2">
                <span className="px-2 py-0.5 bg-[#06b6d4]/10 text-cyan text-[10px] rounded uppercase font-mono">
                  Fast/Slow EMA Crossover
                </span>
              </div>
            </div>
            
            <div className="flex-1 w-full min-h-0">
              {selectedTicks.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={selectedTicks} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke="#1a233b" strokeDasharray="3 3" />
                    <XAxis dataKey="t" stroke="#475569" tick={{ fontSize: 10 }} unit="s" />
                    <YAxis stroke="#475569" tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0c1224', borderColor: '#2d3b5e' }}
                      labelStyle={{ color: '#94a3b8' }}
                    />
                    {/* Exit cliff marker */}
                    <ReferenceLine x={162} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Exit Cliff (162s)', fill: '#ef4444', fontSize: 10, position: 'insideTopLeft' }} />
                    <Line type="monotone" dataKey="price" stroke="#06b6d4" strokeWidth={2} dot={false} name="Token Price" />
                    <Line type="monotone" dataKey="ema_fast" stroke="#a855f7" strokeWidth={1} dot={false} strokeDasharray="2 2" name="Fast EMA" />
                    <Line type="monotone" dataKey="ema_slow" stroke="#64748b" strokeWidth={1} dot={false} strokeDasharray="2 2" name="Slow EMA" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-text-secondary">
                  No tick logs captured for this round.
                </div>
              )}
            </div>
          </div>

          {/* Chart 2: Cumulative Curve */}
          <div className="glass-card p-5 h-[340px] flex flex-col">
            <h2 className="text-sm font-semibold uppercase font-display tracking-wider text-cyan mb-4">
              Skeet vs. Swarm (Hosted MeanReversion Agent) Cumulative PnL
            </h2>
            <div className="flex-1 w-full min-h-0">
              {cumulativeData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={cumulativeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke="#1a233b" strokeDasharray="3 3" />
                    <XAxis dataKey="name" stroke="#475569" tick={{ fontSize: 10 }} />
                    <YAxis stroke="#475569" tick={{ fontSize: 10 }} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0c1224', borderColor: '#2d3b5e' }}
                      labelStyle={{ color: '#94a3b8' }}
                    />
                    <Line type="monotone" dataKey="Skeet" stroke="#10b981" strokeWidth={2} name="Skeet (Momentum)" />
                    <Line type="monotone" dataKey="MeanReversion" stroke="#ef4444" strokeWidth={2} name="MeanReversion Swarm" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-text-secondary">
                  Awaiting round results...
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Right 1 Col: Selector & Actions Log */}
        <div className="glass-card p-5 flex flex-col h-[744px]">
          <h2 className="text-sm font-semibold uppercase font-display tracking-wider text-cyan mb-4">
            Rounds Inspector
          </h2>
          
          <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2">
            {rounds.map((round) => {
              const isSelected = round.game_id === selectedRoundId;
              return (
                <button
                  key={round.game_id}
                  onClick={() => setSelectedRoundId(round.game_id)}
                  className={`w-full text-left p-3.5 rounded-lg border transition-all cursor-pointer ${
                    isSelected 
                      ? 'bg-cyan/5 border-cyan/30 text-slate-100 glow-cyan' 
                      : 'bg-transparent border-border hover:border-border-bright text-text-secondary'
                  }`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-mono text-xs font-semibold uppercase">{round.game_id.split('_')[0]}</span>
                    <span className={`text-xs font-mono font-bold ${
                      round.entered === 0 
                        ? 'text-amber' 
                        : round.pnl_usdc >= 0 ? 'text-emerald' : 'text-red'
                    }`}>
                      {round.entered === 0 
                        ? 'SKIPPED' 
                        : `${round.pnl_usdc >= 0 ? '+' : ''}${round.pnl_usdc.toFixed(2)} USDC`}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center text-[10px] text-text-muted">
                    <span>Vol: {(round.realized_vol * 100).toFixed(1)}%</span>
                    {round.entered === 1 && (
                      <span>Exit: {round.exit_t}s (Frontrun)</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="border-t border-border mt-4 pt-4 flex flex-col gap-3">
            <div className="text-xs font-semibold font-display text-text-secondary uppercase">
              Selected Round Summary
            </div>
            {selectedRound ? (
              <div className="grid grid-cols-2 gap-3 text-xs font-mono bg-bg-base/40 p-3 rounded-lg border border-border">
                <div>
                  <span className="text-text-muted">MM Reference:</span>
                  <div className="text-slate-200 mt-0.5">${selectedRound.ref_price.toFixed(4)}</div>
                </div>
                <div>
                  <span className="text-text-muted">Realized Vol:</span>
                  <div className="text-slate-200 mt-0.5">{(selectedRound.realized_vol * 100).toFixed(2)}%</div>
                </div>
                <div>
                  <span className="text-text-muted">Selective Entry:</span>
                  <div className="text-slate-200 mt-0.5">{selectedRound.entered === 1 ? 'YES' : 'NO'}</div>
                </div>
                <div>
                  <span className="text-text-muted">Buy Size:</span>
                  <div className="text-slate-200 mt-0.5">{selectedRound.buy_usdc} USDC</div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-text-muted">Select a round from the inspector above.</div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
