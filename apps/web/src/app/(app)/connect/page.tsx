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
    <div className="min-h-screen bg-bg-base flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <AnimatePresence mode="wait">
          {/* Loading */}
          {phase === 'loading' && (
            <PhaseCard key="loading">
              <Loader2 size={40} className="animate-spin text-primary-400 mx-auto" />
              <p className="text-sm text-text-secondary mt-3">Verificando conexao...</p>
            </PhaseCard>
          )}

          {/* Creating instance */}
          {(phase === 'create' || phase === 'creating') && (
            <PhaseCard key="create">
              <Loader2 size={40} className="animate-spin text-primary-400 mx-auto" />
              <p className="text-sm text-text-secondary mt-3">Criando instancia WhatsApp...</p>
            </PhaseCard>
          )}

          {/* QR Code scan */}
          {(phase === 'scan' || phase === 'reconnect') && (
            <PhaseCard key="scan">
              <QrCode size={32} className="text-primary-400 mx-auto mb-2" />
              <h2 className="text-lg font-semibold text-text-primary mb-1">
                {phase === 'reconnect' ? 'Reconectar WhatsApp' : 'Conectar WhatsApp'}
              </h2>
              <p className="text-sm text-text-secondary mb-6">
                Abra o WhatsApp no celular, va em Aparelhos conectados e escaneie o codigo abaixo.
              </p>

              {qrData?.qrCode ? (
                <div className="bg-white p-4 rounded-lg mx-auto w-fit">
                  <img
                    src={qrData.qrCode.startsWith('data:') ? qrData.qrCode : `data:image/png;base64,${qrData.qrCode}`}
                    alt="QR Code"
                    className="w-64 h-64"
                  />
                </div>
              ) : (
                <div className="w-64 h-64 mx-auto bg-bg-elevated rounded-lg flex items-center justify-center">
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
            <PhaseCard key="syncing">
              <Loader2 size={40} className="animate-spin text-primary-400 mx-auto" />
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
            <PhaseCard key="done">
              <CheckCircle2 size={40} className="text-success mx-auto" />
              <h2 className="text-lg font-semibold text-text-primary mt-3 mb-1">
                Tudo pronto!
              </h2>
              <p className="text-sm text-text-secondary">
                Redirecionando para suas conversas...
              </p>
            </PhaseCard>
          )}

          {/* Error */}
          {phase === 'error' && (
            <PhaseCard key="error">
              <AlertCircle size={40} className="text-error mx-auto" />
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
                <RefreshCw size={16} className={(createInstance.isPending || startSync.isPending) ? 'animate-spin' : ''} />
                <span className="ml-2">Tentar novamente</span>
              </Button>
            </PhaseCard>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function PhaseCard({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="bg-bg-surface border border-border rounded-modal p-8 text-center"
    >
      {children}
    </motion.div>
  );
}
