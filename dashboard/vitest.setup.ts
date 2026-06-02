import '@testing-library/jest-dom';
import { vi } from 'vitest';
import React from 'react';

// Mock Recharts to avoid layout and SVG rendering issues inside JSDOM
vi.mock('recharts', () => {
  return {
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => {
      return React.createElement('div', { 
        style: { width: '800px', height: '400px' },
        'data-testid': 'recharts-responsive-container'
      }, children);
    },
    LineChart: ({ children }: { children: React.ReactNode }) => React.createElement('div', { 'data-testid': 'recharts-line-chart' }, children),
    Line: () => React.createElement('div', { 'data-testid': 'recharts-line' }),
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    ReferenceLine: () => null,
  };
});
