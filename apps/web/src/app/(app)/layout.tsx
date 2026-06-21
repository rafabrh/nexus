'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/query-client';
import { ToastProvider } from '@/components/ui/toast-provider';
import { TopBar } from '@/components/layout/top-bar';
import { useSocket } from '@/hooks/use-socket';
import { useAuthStore } from '@/stores/auth.store';
import { useRealtimeStore } from '@/stores/realtime.store';
import { api, tryRefreshSession } from '@/lib/api';

function SocketManager() {
  useSocket();
  return null;
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, setToken } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated) {
      tryRefreshSession()
        .then((token) => {
          if (token) {
            setToken(token);
          } else {
            router.replace('/login');
          }
        })
        .catch(() => {
          router.replace('/login');
        });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <ConnectionGuard pathname={pathname}>{children}</ConnectionGuard>;
}

function ConnectionGuard({ children, pathname }: { children: React.ReactNode; pathname: string }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const instanceState = useRealtimeStore((s) => s.instanceState);

  // Real-time connection guard: if the backend pushes that the WhatsApp instance
  // dropped or was deleted while the operator is on a protected screen, bounce to
  // /connect immediately instead of leaving stale conversations on screen.
  useEffect(() => {
    if (instanceState && instanceState !== 'open' && pathname !== '/connect') {
      router.replace('/connect');
    }
  }, [instanceState, pathname, router]);

  useEffect(() => {
    if (pathname === '/connect') {
      setChecked(true);
      return;
    }

    api<{ instanceExists: boolean; connectionState: string | null; syncStatus: string | null }>(
      '/api/v1/onboarding/state',
    )
      .then((state) => {
        if (
          !state.instanceExists ||
          state.connectionState !== 'open' ||
          state.syncStatus !== 'done'
        ) {
          router.replace('/connect');
        } else {
          setChecked(true);
        }
      })
      .catch(() => {
        // Fail-safe: if we can't confirm the connection, treat as not-onboarded
        // and send to /connect (which re-checks and bounces back when ready)
        // instead of silently exposing an unconfigured panel.
        router.replace('/connect');
      });
  }, [pathname, router]);

  if (!checked) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthGuard>
        <SocketManager />
        <TopBar />
        <main className="pt-12 min-h-screen bg-bg-base">
          {children}
        </main>
        <ToastProvider />
      </AuthGuard>
    </QueryClientProvider>
  );
}
