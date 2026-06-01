import type { Metadata } from 'next';
import { Inter, Orbitron, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

const orbitron = Orbitron({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://skeet-dashboard.vercel.app'),
  title: 'Skeet — PvP Trading Agent Console',
  description: 'Fully autonomous PvP momentum trading agent and real-time telemetry console for BID Protocol.',
  icons: {
    icon: '/icon.svg',
  },
  openGraph: {
    title: 'Skeet — PvP Trading Agent Console',
    description: 'Fully autonomous PvP momentum trading agent and real-time telemetry console for BID Protocol.',
    url: 'https://skeet-dashboard.vercel.app',
    siteName: 'Skeet',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Skeet Dashboard',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Skeet — PvP Trading Agent Console',
    description: 'Fully autonomous PvP momentum trading agent and real-time telemetry console for BID Protocol.',
    images: ['/og-image.png'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${orbitron.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <body className="antialiased scanlines relative min-h-screen">
        {children}
      </body>
    </html>
  );
}
