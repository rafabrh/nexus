'use client';

import { useRef, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Bot, Bell, Wifi, WifiOff, User, Settings, LogOut, Sun } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import gsap from 'gsap';
import { cn } from '@/lib/utils';
import { useRealtimeStore } from '@/stores/realtime.store';
import { useReminders } from '@/hooks/use-reminders';
import { useAuthStore } from '@/stores/auth.store';
import { useSettingsStore } from '@/stores/settings.store';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { api } from '@/lib/api';

/** Decodes the `sub` (email) claim from the JWT for display. */
function emailFromToken(token: string | null): string | null {
  if (!token) return null;
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(part)).sub ?? null;
  } catch {
    return null;
  }
}

function UserMenu() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const logout = useAuthStore((s) => s.logout);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const displayName = useSettingsStore((s) => s.displayName);
  const email = emailFromToken(token);
  const shownName = displayName || email;
  const initial = (shownName?.[0] ?? 'U').toUpperCase();

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const handleLogout = async () => {
    // Best-effort server-side logout (blacklists token + clears cookies);
    // the client state is cleared regardless.
    try {
      await api('/api/v1/auth/logout', { method: 'POST', body: '{}' });
    } catch {
      // ignore — we still clear the client session below
    }
    logout();
    router.replace('/login');
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Menu do usuario"
        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white transition-transform duration-150 hover:scale-105"
        style={{ background: 'var(--accent-500)' }}
      >
        {initial}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 mt-2 w-56 rounded-xl overflow-hidden z-50"
            style={{
              background: 'var(--glass-bg)',
              backdropFilter: 'blur(20px) saturate(1.4)',
              WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
              border: '1px solid var(--glass-border)',
              boxShadow: 'var(--shadow-panel)',
            }}
          >
            <div className="px-4 py-3 border-b border-separator">
              <div className="flex items-center gap-2">
                <User size={14} className="text-text-muted flex-shrink-0" />
                <span className="text-xs text-text-secondary truncate" title={email ?? undefined}>
                  {shownName ?? 'Conta'}
                </span>
              </div>
            </div>

            {/* Tema */}
            <div className="px-4 py-3 border-b border-separator">
              <div className="flex items-center gap-1.5 mb-2">
                <Sun size={13} className="text-text-muted flex-shrink-0" />
                <span className="text-xs text-text-secondary">Tema</span>
              </div>
              <ThemeToggle />
            </div>

            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors duration-150"
            >
              <Settings size={15} />
              Configurações
            </Link>

            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-error hover:bg-error/[0.08] transition-colors duration-150"
            >
              <LogOut size={15} />
              Sair
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const NAV_TABS = [
  { label: 'Conversas', href: '/conversations' },
  { label: 'Kanban', href: '/kanban' },
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Feed IA', href: '/feed' },
];

export function TopBar() {
  const pathname = usePathname();
  const connected = useRealtimeStore((s) => s.connected);
  const { data: reminders } = useReminders('pending');
  const pendingCount = reminders?.length ?? 0;

  const bellRef = useRef<HTMLButtonElement>(null);
  const prevCountRef = useRef(pendingCount);

  useEffect(() => {
    if (pendingCount > prevCountRef.current && bellRef.current) {
      gsap.fromTo(
        bellRef.current,
        { scale: 0.5 },
        {
          scale: 1,
          duration: 0.4,
          ease: 'back.out(2)',
          keyframes: [
            { scale: 0.5, duration: 0 },
            { scale: 1.15, duration: 0.25 },
            { scale: 1.0, duration: 0.15 },
          ],
        },
      );
    }
    prevCountRef.current = pendingCount;
  }, [pendingCount]);

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 h-12 flex items-center"
      style={{
        background: 'rgba(20,24,32,0.72)',
        backdropFilter: 'blur(16px) saturate(1.3)',
        WebkitBackdropFilter: 'blur(16px) saturate(1.3)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Logo zone — 320px */}
      <div className="w-80 flex-shrink-0 flex items-center gap-2 px-5">
        <Bot size={20} className="text-primary-400" />
        <span className="text-md font-semibold text-text-primary tracking-tight">
          NEXUS
        </span>
        <span className="text-xs text-text-muted font-normal">Panel</span>
      </div>

      {/* Tabs — center */}
      <nav className="flex-1 flex items-center justify-center gap-1">
        {NAV_TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'relative px-4 h-12 flex items-center text-sm font-medium transition-colors duration-150',
                active
                  ? 'text-primary-400'
                  : 'text-text-secondary hover:text-text-primary',
              )}
            >
              {tab.label}
              <AnimatePresence>
                {active && (
                  <motion.span
                    layoutId="tab-indicator"
                    className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full"
                    style={{
                      background:
                        'linear-gradient(90deg, var(--color-primary-400), var(--color-primary-600))',
                    }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                  />
                )}
              </AnimatePresence>
            </Link>
          );
        })}
      </nav>

      {/* Actions — right */}
      <div className="flex-shrink-0 flex items-center gap-3 px-5">
        {/* Connection status */}
        <Link
          href="/connect"
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
            connected
              ? 'text-success'
              : 'text-error',
          )}
          style={{
            border: `1px solid ${connected ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}`,
            background: connected ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
          }}
        >
          {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
          {connected ? 'Online' : 'Offline'}
        </Link>

        {/* Notifications */}
        <button
          ref={bellRef}
          aria-label="Notificacoes"
          className="relative w-8 h-8 rounded-input bg-bg-elevated border border-border flex items-center justify-center hover:bg-bg-hover transition-colors duration-150"
        >
          <Bell size={14} className="text-text-secondary" />
          {pendingCount > 0 && (
            <span
              className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-error text-[10px] font-bold text-white flex items-center justify-center"
              style={{ border: '2px solid #141820' }}
            >
              {pendingCount > 9 ? '9+' : pendingCount}
            </span>
          )}
        </button>

        {/* User menu — account + logout */}
        <UserMenu />
      </div>
    </header>
  );
}
