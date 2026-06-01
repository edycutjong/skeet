import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Skeet — Command Center Dashboard',
  description: 'PvP Trading Agent telemetry console for BID Protocol.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Orbitron:wght@500;700;900&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased scanlines relative min-h-screen">
        {children}
      </body>
    </html>
  );
}
