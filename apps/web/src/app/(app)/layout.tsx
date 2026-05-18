'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/query-client';
import { ToastProvider } from '@/components/ui/toast-provider';
import { TopBar } from '@/components/layout/top-bar';
import { useSocket } from '@/hooks/use-socket';
import { useAuthStore } from '@/stores/auth.store';
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
        setChecked(true);
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
