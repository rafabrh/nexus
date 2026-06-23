import type { Metadata } from 'next';
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
