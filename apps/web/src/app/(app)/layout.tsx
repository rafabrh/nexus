'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/query-client';
import { ToastProvider } from '@/components/ui/toast-provider';
import { TopBar } from '@/components/layout/top-bar';
import { useSocket } from '@/hooks/use-socket';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/lib/api';

function SocketManager() {
  useSocket();
  return null;
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, setToken } = useAuthStore();

  useEffect(() => {
    // Try to refresh token on mount
    if (!isAuthenticated) {
      api('/api/v1/auth/refresh', { method: 'POST' })
        .then((data: any) => {
          if (data?.accessToken) {
            setToken(data.accessToken);
          } else {
            router.replace('/login');
          }
        })
        .catch(() => {
          router.replace('/login');
        });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Show nothing while checking auth
  if (!isAuthenticated) {
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
