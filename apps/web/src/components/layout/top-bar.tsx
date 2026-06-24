'use client';

import { useRef, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Bot,
  Bell,
  Wifi,
  WifiOff,
  User,
  Settings,
  LogOut,
  Sun,
  AlertCircle,
  CheckCircle2,
  Info,
  Clock,
  Trash2,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import gsap from 'gsap';
import { cn, timeAgo } from '@/lib/utils';
import { useRealtimeStore } from '@/stores/realtime.store';
import { useReminders } from '@/hooks/use-reminders';
import { useAuthStore } from '@/stores/auth.store';
import { useSettingsStore } from '@/stores/settings.store';
import {
  useNotificationsStore,
  selectUnreadCount,
  type NotificationKind,
} from '@/stores/notifications.store';
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

const KIND_META: Record<
  NotificationKind,
  { Icon: typeof AlertCircle; color: string }
> = {
  error: { Icon: AlertCircle, color: 'var(--error)' },
  success: { Icon: CheckCircle2, color: 'var(--success)' },
  info: { Icon: Info, color: 'var(--text-secondary)' },
};

/**
 * Bell menu — the "central de notificações". Collects the app's notifications
 * (via the notify helper) so they no longer pop laterally; the operator reviews
 * them here on demand. Pending reminders are surfaced at the top for context.
 */
function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);

  const items = useNotificationsStore((s) => s.items);
  const unread = useNotificationsStore(selectUnreadCount);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);
  const remove = useNotificationsStore((s) => s.remove);
  const clear = useNotificationsStore((s) => s.clear);

  const { data: reminders } = useReminders('pending');
  const pendingReminders = reminders?.length ?? 0;

  const badge = unread + pendingReminders;
  const prevBadge = useRef(badge);

  // Pop the bell whenever the badge grows (new notification or reminder).
  useEffect(() => {
    if (badge > prevBadge.current && bellRef.current) {
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
    prevBadge.current = badge;
  }, [badge]);

  // Close on outside click; mark notifications read when opening.
  useEffect(() => {
    if (!open) return;
    markAllRead();
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open, markAllRead]);

  return (
    <div className="relative" ref={ref}>
      <button
        ref={bellRef}
        onClick={() => setOpen((v) => !v)}
        aria-label="Notificacoes"
        className="relative w-8 h-8 rounded-input bg-bg-elevated border border-border flex items-center justify-center hover:bg-bg-hover transition-colors duration-150 focus-ring"
        style={{ boxShadow: 'inset 0 1px 0 var(--mirror-edge)' }}
      >
        <Bell size={14} className="text-text-secondary" />
        {badge > 0 && (
          <span
            className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-error text-[10px] font-bold text-white flex items-center justify-center"
            style={{ border: '2px solid var(--bg-base)' }}
          >
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="glass-popup absolute right-0 mt-2 w-80 rounded-2xl overflow-hidden z-50"
            style={{ boxShadow: 'var(--shadow-panel)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-separator">
              <span className="text-xs font-semibold text-text-secondary">
                Notificações
              </span>
              {items.length > 0 && (
                <button
                  onClick={clear}
                  className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary transition-colors duration-150"
                >
                  <Trash2 size={12} />
                  Limpar
                </button>
              )}
            </div>

            {/* Pending reminders hint */}
            {pendingReminders > 0 && (
              <div className="flex items-center gap-2 px-4 py-2 border-b border-separator bg-warning/[0.06]">
                <Clock size={13} className="text-warning flex-shrink-0" />
                <span className="text-xs text-text-secondary">
                  {pendingReminders} lembrete{pendingReminders !== 1 ? 's' : ''} pendente
                  {pendingReminders !== 1 ? 's' : ''}
                </span>
              </div>
            )}

            {/* List */}
            <div className="max-h-80 overflow-y-auto">
              {items.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <Bell size={18} className="text-text-muted/50 mx-auto mb-2" />
                  <p className="text-xs text-text-muted">Nenhuma notificação</p>
                </div>
              ) : (
                items.map((n) => {
                  const { Icon, color } = KIND_META[n.kind];
                  return (
                    <div
                      key={n.id}
                      className="group flex items-start gap-2.5 px-4 py-2.5 border-b border-separator/60 hover:bg-bg-hover transition-colors duration-150"
                    >
                      <Icon
                        size={14}
                        className="flex-shrink-0 mt-0.5"
                        style={{ color }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-text-primary leading-snug break-words">
                          {n.message}
                        </p>
                        <span className="text-[11px] text-text-muted">
                          {timeAgo(n.at)}
                        </span>
                      </div>
                      <button
                        onClick={() => remove(n.id)}
                        aria-label="Remover notificação"
                        className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-text-muted hover:text-text-primary transition-opacity duration-150"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
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
        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white transition-transform duration-150 hover:scale-105 focus-ring"
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
            className="glass-popup absolute right-0 mt-2 w-56 rounded-2xl overflow-hidden z-50"
            style={{
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

  return (
    <header
      className="vibrancy-bar fixed top-0 left-0 right-0 z-50 h-12 flex items-center"
      style={{
        borderBottom: '1px solid var(--separator)',
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

      {/* Tabs — center. Active tab sits on a polished glass "mirror" pill that
          slides between tabs (shared layoutId), giving the bar a segmented-
          control feel without losing the accent identity. */}
      <nav className="flex-1 flex items-center justify-center gap-1">
        {NAV_TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'relative px-4 h-8 flex items-center rounded-pill text-sm font-medium transition-colors duration-150',
                active
                  ? 'text-primary-400'
                  : 'text-text-secondary hover:text-text-primary',
              )}
            >
              {active && (
                <motion.span
                  layoutId="tab-pill"
                  className="glass absolute inset-0 rounded-pill"
                  style={{
                    backgroundImage:
                      'linear-gradient(180deg, var(--mirror-sheen-top), transparent 60%)',
                    boxShadow:
                      'inset 0 1px 0 var(--mirror-edge), var(--shadow-control)',
                  }}
                  transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                />
              )}
              <span className="relative z-10">{tab.label}</span>
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
            boxShadow: 'inset 0 1px 0 var(--mirror-edge)',
          }}
        >
          {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
          {connected ? 'Online' : 'Offline'}
        </Link>

        {/* Notifications — bell menu */}
        <NotificationsMenu />

        {/* User menu — account + logout */}
        <UserMenu />
      </div>
    </header>
  );
}
