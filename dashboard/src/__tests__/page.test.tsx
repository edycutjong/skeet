import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import Dashboard from '../app/page';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Dashboard Page Component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Helper to flush all microtasks and macro (setTimeout) tasks
  const flushPromises = async () => {
    await act(async () => {
      vi.advanceTimersByTime(0);
    });
    // Flush microtask promise queue
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
  };

  it('should render fallback mock data when fetch returns empty rounds', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ rounds: [], ticks: [], connected: false }),
    });

    await act(async () => {
      render(<Dashboard />);
    });

    await flushPromises();

    expect(screen.getByText('Skeet PVP Telemetry')).toBeInTheDocument();
    expect(screen.getByText('DEMO REPLAY MODE')).toBeInTheDocument();
    expect(screen.getAllByText(/frostvault/i).length).toBeGreaterThan(0);
    expect(screen.getByText('+672.50 USDC')).toBeInTheDocument();
  });

  it('should render live daemon data with negative PnL when fetch succeeds', async () => {
    const mockRounds = [
      { game_id: 'live_round_1', ref_price: 1.5, realized_vol: 0.1, entered: 1, buy_usdc: 50, exit_t: 162, pnl_usdc: -15.5, bankroll_after: 9984.5, ts: Date.now() },
      { game_id: 'live_round_2', ref_price: 1.6, realized_vol: 0.05, entered: 0, buy_usdc: 0, exit_t: 0, pnl_usdc: 0, bankroll_after: 9984.5, ts: Date.now() - 5000 },
    ];
    const mockTicks = [
      { game_id: 'live_round_1', t: 10, price: 1.55, reserves_usdc: 5000, ema_fast: 1.56, ema_slow: 1.54, action: 'HOLD', size: 0 },
    ];

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ rounds: mockRounds, ticks: mockTicks, connected: true }),
    });

    await act(async () => {
      render(<Dashboard />);
    });

    await flushPromises();

    expect(screen.getByText('LIVE DAEMON ACTIVE')).toBeInTheDocument();
    expect(screen.getAllByText(/live/i).length).toBeGreaterThan(0);
    // Negative PnL check (should NOT contain "+", should display negative value)
    expect(screen.getAllByText('-15.50 USDC').length).toBeGreaterThan(0);
    expect(screen.getByText('9984.50 USDC')).toBeInTheDocument();
  });

  it('should fallback to mock data on fetch API error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    await act(async () => {
      render(<Dashboard />);
    });

    await flushPromises();

    expect(screen.getByText('DEMO REPLAY MODE')).toBeInTheDocument();
    expect(screen.getByText('+672.50 USDC')).toBeInTheDocument();
  });

  it('should fallback to mock data when API response is not ok', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
    });

    await act(async () => {
      render(<Dashboard />);
    });

    await flushPromises();

    expect(screen.getByText('DEMO REPLAY MODE')).toBeInTheDocument();
  });

  it('should refresh data when clicking refresh button', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ rounds: [], ticks: [], connected: false }),
    });

    await act(async () => {
      render(<Dashboard />);
    });

    await flushPromises();

    expect(mockFetch).toHaveBeenCalledTimes(1);

    const refreshBtn = screen.getByRole('button', { name: /refresh data/i });
    
    // Reset mock count before click
    mockFetch.mockClear();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ rounds: [], ticks: [], connected: false }),
    });

    await act(async () => {
      fireEvent.click(refreshBtn);
    });

    // Flush refresh call promises
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should change selected round and update metrics on click (including entered vs not entered)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ rounds: [], ticks: [], connected: false }),
    });

    await act(async () => {
      render(<Dashboard />);
    });

    await flushPromises();

    // Default selected round is mockRounds[0] (frostvault_5) -> Realized Vol: 6.00%, entered: 1
    // (Wait, default mockRounds[0] in mock list is frostvault_1, vol: 5.00%)
    expect(screen.getByText('5.00%')).toBeInTheDocument();
    expect(screen.getByText('YES')).toBeInTheDocument(); // entered is 1

    // Find and click frostvault_2 (entered: 0)
    const round2Button = screen.getByText('SKIPPED').closest('button');
    expect(round2Button).not.toBeNull();

    if (round2Button) {
      await act(async () => {
        fireEvent.click(round2Button);
      });
      // Selected round summary should update to show entered: NO
      expect(screen.getByText('NO')).toBeInTheDocument();
    }

    // Find and click frostvault_3
    const round3Button = screen.getByText('-64.00 USDC').closest('button');
    expect(round3Button).not.toBeNull();

    if (round3Button) {
      await act(async () => {
        fireEvent.click(round3Button);
      });
      // Selected round summary should update to show its buy_usdc (800)
      expect(screen.getByText('800 USDC')).toBeInTheDocument();
    }
  });

  it('should trigger fetch interval every 5 seconds', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ rounds: [], ticks: [], connected: false }),
    });

    await act(async () => {
      render(<Dashboard />);
    });

    await flushPromises();
    expect(mockFetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});
