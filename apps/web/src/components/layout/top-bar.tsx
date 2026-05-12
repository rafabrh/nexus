'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bot, Bell, Wifi, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRealtimeStore } from '@/stores/realtime.store';
import { useReminders } from '@/hooks/use-reminders';

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

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-12 bg-bg-surface border-b border-border flex items-center">
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
              {active && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary-500 rounded-full" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Actions — right */}
      <div className="flex-shrink-0 flex items-center gap-3 px-5">
        {/* Connection status */}
        <div
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 rounded-badge text-xs',
            connected
              ? 'text-success bg-success/10'
              : 'text-error bg-error/10',
          )}
        >
          {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
          {connected ? 'Online' : 'Offline'}
        </div>

        {/* Notifications */}
        <button className="relative w-8 h-8 rounded-input bg-bg-elevated border border-border flex items-center justify-center hover:bg-bg-hover transition-colors duration-150">
          <Bell size={14} className="text-text-secondary" />
          {pendingCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-error text-[10px] font-bold text-white flex items-center justify-center">
              {pendingCount > 9 ? '9+' : pendingCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
