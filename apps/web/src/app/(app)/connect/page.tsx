'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, QrCode, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { queryClient } from '@/lib/query-client';
import {
  useOnboardingState,
  useCreateInstance,
  useQrCode,
  useStartSync,
} from '@/hooks/use-onboarding';

type Phase = 'loading' | 'create' | 'creating' | 'scan' | 'syncing' | 'done' | 'error' | 'reconnect';

function resolvePhase(
  state: { instanceExists: boolean; connectionState: string | null; syncStatus: string | null } | undefined,
  isLoading: boolean,
  isCreating: boolean,
  createError: boolean,
): Phase {
  if (isLoading || !state) return 'loading';
  if (createError) return 'error';
  if (isCreating) return 'creating';
  if (!state.instanceExists) return 'create';
  if (state.connectionState === 'close') return 'reconnect';
  if (state.connectionState !== 'open') return 'scan';
  if (state.syncStatus === 'syncing') return 'syncing';
  if (state.syncStatus === 'error') return 'error';
  if (state.syncStatus === 'done') return 'done';
  // connected but sync pending — auto-trigger sync
  return 'syncing';
}

/** Badge indicating connection state with semantic colour token. */
function ConnectionBadge({ phase }: { phase: Phase }) {
  const stateMap: Record<Phase, { label: string; token: string }> = {
    done: { label: 'Conectado', token: 'var(--success)' },
    syncing: { label: 'Sincronizando', token: 'var(--warning)' },
    scan: { label: 'Aguardando scan', token: 'var(--warning)' },
    reconnect: { label: 'Desconectado', token: 'var(--error)' },
    error: { label: 'Erro', token: 'var(--error)' },
    loading: { label: 'Verificando', token: 'var(--info)' },
    create: { label: 'Configurando', token: 'var(--info)' },
    creating: { label: 'Configurando', token: 'var(--info)' },
  };

  const { label, token } = stateMap[phase] ?? stateMap.loading;

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        borderRadius: '9999px',
        background: `color-mix(in srgb, ${token} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${token} 25%, transparent)`,
        marginBottom: '20px',
      }}
    >
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: token,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontSize: '11px',
          fontWeight: 600,
          letterSpacing: '0.04em',
          color: token,
        }}
      >
        {label}
      </span>
    </div>
  );
}

export default function ConnectPage() {
  const router = useRouter();
  const createCalledRef = useRef(false);
  const syncCalledRef = useRef(false);

  const { data: state, isLoading } = useOnboardingState({
    refetchInterval: 3000,
  });

  const createInstance = useCreateInstance();
  const startSync = useStartSync();

  const phase = resolvePhase(
    state,
    isLoading,
    createInstance.isPending,
    createInstance.isError,
  );

  const showQr = phase === 'scan' || phase === 'reconnect';
  const { data: qrData } = useQrCode(showQr);

  // Auto-create instance on first visit (only once)
  useEffect(() => {
    if (phase === 'create' && !createCalledRef.current) {
      createCalledRef.current = true;
      createInstance.mutate();
    }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-start sync when connection opens and sync is pending (only once)
  useEffect(() => {
    if (
      state?.connectionState === 'open' &&
      (state?.syncStatus === 'pending' || state?.syncStatus === null) &&
      !syncCalledRef.current &&
      !startSync.isPending
    ) {
      syncCalledRef.current = true;
      startSync.mutate();
    }
  }, [state?.connectionState, state?.syncStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  // Already connected: refresh the conversation caches, then go to the panel.
  useEffect(() => {
    if (phase === 'done') {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      const timer = setTimeout(() => router.replace('/conversations'), 1500);
      return () => clearTimeout(timer);
    }
  }, [phase, router]);

  return (
    <div
      className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden"
      style={{ background: 'var(--bg-base)' }}
    >
      {/* Ambient backdrop so the glass sheet has light to refract (macOS depth) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(60% 50% at 50% 28%, color-mix(in srgb, var(--accent-500) 16%, transparent), transparent 70%), radial-gradient(55% 45% at 50% 105%, color-mix(in srgb, var(--accent-500) 10%, transparent), transparent 72%)',
        }}
      />
      <div className="relative w-full max-w-md">
        <AnimatePresence mode="wait">
          {/* Loading */}
          {phase === 'loading' && (
            <PhaseCard key="loading" phase={phase}>
              <Loader2
                size={36}
                className="animate-spin mx-auto"
                style={{ color: 'var(--accent-500)' }}
              />
              <p className="text-sm text-text-secondary mt-3">Verificando conexao...</p>
            </PhaseCard>
          )}

          {/* Creating instance */}
          {(phase === 'create' || phase === 'creating') && (
            <PhaseCard key="create" phase={phase}>
              <Loader2
                size={36}
                className="animate-spin mx-auto"
                style={{ color: 'var(--accent-500)' }}
              />
              <p className="text-sm text-text-secondary mt-3">Criando instancia WhatsApp...</p>
            </PhaseCard>
          )}

          {/* QR Code scan */}
          {(phase === 'scan' || phase === 'reconnect') && (
            <PhaseCard key="scan" phase={phase}>
              <QrCode
                size={28}
                className="mx-auto mb-3"
                style={{ color: 'var(--accent-500)' }}
              />
              <h2 className="text-lg font-semibold text-text-primary mb-1">
                {phase === 'reconnect' ? 'Reconectar WhatsApp' : 'Conectar WhatsApp'}
              </h2>
              <p className="text-sm text-text-secondary mb-6">
                Abra o WhatsApp no celular, va em Aparelhos conectados e escaneie o codigo abaixo.
              </p>

              {qrData?.qrCode ? (
                /* QR code in its own clean card — white bg required for scanner */
                <div
                  style={{
                    background: '#FFFFFF',
                    borderRadius: 'var(--radius-xl)',
                    padding: '16px',
                    display: 'inline-flex',
                    margin: '0 auto',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), var(--shadow-panel)',
                    border: '1px solid var(--glass-border)',
                  }}
                >
                  <img
                    src={
                      qrData.qrCode.startsWith('data:')
                        ? qrData.qrCode
                        : `data:image/png;base64,${qrData.qrCode}`
                    }
                    alt="QR Code WhatsApp"
                    className="w-56 h-56"
                  />
                </div>
              ) : (
                <div
                  style={{
                    width: '224px',
                    height: '224px',
                    margin: '0 auto',
                    background: 'var(--bg-elevated)',
                    borderRadius: 'var(--radius-xl)',
                    border: '1px solid var(--separator)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Loader2 size={24} className="animate-spin text-text-muted" />
                </div>
              )}

              <p className="text-xs text-text-muted mt-4">
                O codigo atualiza automaticamente a cada 30 segundos
              </p>
            </PhaseCard>
          )}

          {/* Syncing */}
          {phase === 'syncing' && (
            <PhaseCard key="syncing" phase={phase}>
              <Loader2
                size={36}
                className="animate-spin mx-auto"
                style={{ color: 'var(--accent-500)' }}
              />
              <h2 className="text-lg font-semibold text-text-primary mt-3 mb-1">
                Sincronizando conversas
              </h2>
              <p className="text-sm text-text-secondary">
                Importando seu historico do WhatsApp. Isso pode levar alguns minutos...
              </p>
            </PhaseCard>
          )}

          {/* Done */}
          {phase === 'done' && (
            <PhaseCard key="done" phase={phase}>
              <CheckCircle2
                size={40}
                className="mx-auto"
                style={{ color: 'var(--success)' }}
              />
              <h2 className="text-lg font-semibold text-text-primary mt-3 mb-1">Tudo pronto!</h2>
              <p className="text-sm text-text-secondary">
                Redirecionando para suas conversas...
              </p>
            </PhaseCard>
          )}

          {/* Error */}
          {phase === 'error' && (
            <PhaseCard key="error" phase={phase}>
              <AlertCircle
                size={40}
                className="mx-auto"
                style={{ color: 'var(--error)' }}
              />
              <h2 className="text-lg font-semibold text-text-primary mt-3 mb-1">
                Erro no onboarding
              </h2>
              <p className="text-sm text-text-secondary mb-4">
                {createInstance.isError
                  ? 'Falha ao criar instancia WhatsApp. Tente novamente.'
                  : 'Houve um problema ao importar suas conversas. Tente novamente.'}
              </p>
              <Button
                onClick={() => {
                  if (createInstance.isError) {
                    createInstance.reset();
                    createCalledRef.current = false;
                  } else {
                    syncCalledRef.current = false;
                    startSync.mutate();
                  }
                }}
                disabled={createInstance.isPending || startSync.isPending}
              >
                <RefreshCw
                  size={16}
                  className={
                    createInstance.isPending || startSync.isPending ? 'animate-spin' : ''
                  }
                />
                <span className="ml-2">Tentar novamente</span>
              </Button>
            </PhaseCard>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function PhaseCard({ children, phase }: { children: React.ReactNode; phase: Phase }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="glass-heavy"
      style={{
        borderRadius: 'var(--radius-xl)',
        padding: '32px 28px',
        textAlign: 'center',
      }}
    >
      <ConnectionBadge phase={phase} />
      {children}
    </motion.div>
  );
}
