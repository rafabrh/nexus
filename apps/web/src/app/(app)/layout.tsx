'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
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
  // Screens reachable even when the instance is down (so the operator can fix it).
  // /admin is platform administration — the superadmin has no WhatsApp instance,
  // so it must never be gated behind the connection check.
  const alwaysAllowed =
    pathname === '/connect' || pathname === '/settings' || pathname === '/admin';

  // Só desvia em desconexão REAL. 'connecting' é transitório (aparece durante o
  // pareamento e em flaps momentâneos): tratá-lo como "desconectado" fazia o
  // guard rebater para /connect enquanto a tela de connect reencaminhava de volta
  // a cada 'open' — um ping-pong infinito /connect <-> /conversations.
  const isDisconnected = (s: string | null | undefined) => s === 'close' || s === 'absent';

  useEffect(() => {
    if (isDisconnected(instanceState) && !alwaysAllowed) {
      router.replace('/connect');
    }
  }, [instanceState, alwaysAllowed, router]);

  useEffect(() => {
    if (alwaysAllowed) {
      setChecked(true);
      return;
    }

    api<{ instanceExists: boolean; connectionState: string | null; syncStatus: string | null }>(
      '/api/v1/onboarding/state',
    )
      .then((state) => {
        // Só manda para /connect quando NÃO há instância ou a conexão caiu de
        // verdade. 'connecting' (transitório) e o sync em andamento NÃO bloqueiam:
        // as conversas chegam via realtime, e exigir connectionState==='open' +
        // syncStatus==='done' aqui criava o ping-pong com /connect (que só
        // reencaminha quando já está open+done). O onboarding inicial continua
        // guiado pela própria /connect (o usuário permanece lá até ficar pronto).
        if (!state.instanceExists || isDisconnected(state.connectionState)) {
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
  }, [pathname, router]); // eslint-disable-line react-hooks/exhaustive-deps

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
      {/* Honor the OS "Reduce Motion" setting across all Framer Motion
          animations (layout pills, springs, stagger) — Apple HIG / Inclusion. */}
      <MotionConfig reducedMotion="user">
        <AuthGuard>
          <SocketManager />
          <TopBar />
          <main className="pt-12 min-h-screen bg-bg-base">
            {children}
          </main>
          <ToastProvider />
        </AuthGuard>
      </MotionConfig>
    </QueryClientProvider>
  );
}
