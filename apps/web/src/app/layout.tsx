import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { Inter } from 'next/font/google';
import './globals.css';
import { THEME_INIT_SCRIPT } from '@/lib/theme';
import { ThemeProvider } from '@/components/theme/theme-provider';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: 'NEXUS Panel',
  description: 'Painel de controle do agente NEXUS',
};

// viewport-fit=cover + device-width: garante que o app ocupe a tela toda no
// mobile (respeitando safe-areas de notch) e evita o zoom-out inicial do iOS.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={`${GeistSans.variable} ${GeistMono.variable} ${inter.variable}`}>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} /></head>
      <body><ThemeProvider>{children}</ThemeProvider></body>
    </html>
  );
}
