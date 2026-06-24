'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  RefreshCw,
  RotateCw,
  Radio,
  Volume2,
  Gauge,
  User,
  LogOut,
  Wifi,
  WifiOff,
  Palette,
} from 'lucide-react';
import { useSettingsStore, REFRESH_OPTIONS } from '@/stores/settings.store';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { useAuthStore } from '@/stores/auth.store';
import { useRealtimeStore } from '@/stores/realtime.store';
import {
  useOnboardingState,
  useRefreshConnection,
  useRetrySync,
} from '@/hooks/use-onboarding';
import { reconnectSocket } from '@/hooks/use-socket';
import { api } from '@/lib/api';
import { pageTransition, pageTransitionConfig, staggerContainer, staggerItem } from '@/lib/motion-variants';

interface Claims {
  sub?: string;
  instancia?: string;
  role?: string;
}

function decodeJwt(token: string | null): Claims {
  if (!token) return {};
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(part));
  } catch {
    return {};
  }
}

const glassStyle: React.CSSProperties = {
  border: '1px solid var(--glass-border)',
  borderRadius: '12px',
};

function Section({ icon: Icon, title, desc, children }: { icon: React.ElementType; title: string; desc: string; children: React.ReactNode }) {
  return (
    <motion.section variants={staggerItem} style={glassStyle} className="glass-card p-5">
      <div className="flex items-center gap-2.5 mb-1">
        <Icon size={16} className="text-primary-400" />
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
      </div>
      <p className="text-xs text-text-muted mb-4">{desc}</p>
      <div className="space-y-3">{children}</div>
    </motion.section>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      className="relative w-10 h-6 rounded-full transition-colors duration-200 flex-shrink-0"
      style={{ background: checked ? 'var(--accent-500)' : 'var(--bg-active)' }}
    >
      <motion.span
        className="absolute top-1 w-4 h-4 rounded-full bg-white"
        animate={{ left: checked ? 20 : 4 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />
    </button>
  );
}

function ActionButton({ icon: Icon, label, onClick, loading }: { icon: React.ElementType; label: string; onClick: () => void; loading?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex items-center gap-2 px-3.5 py-2 rounded-input text-sm text-text-primary transition-all duration-150 disabled:opacity-50 hover:bg-bg-hover"
      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}
    >
      <Icon size={14} className={loading ? 'animate-spin text-primary-400' : 'text-primary-400'} />
      {label}
    </button>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const logout = useAuthStore((s) => s.logout);
  const claims = decodeJwt(token);

  const connected = useRealtimeStore((s) => s.connected);
  const { data: state } = useOnboardingState({ refetchInterval: 0 });
  const refreshConn = useRefreshConnection();
  const retrySync = useRetrySync();

  const displayName = useSettingsStore((s) => s.displayName);
  const soundEnabled = useSettingsStore((s) => s.soundEnabled);
  const refreshIntervalMs = useSettingsStore((s) => s.refreshIntervalMs);
  const setDisplayName = useSettingsStore((s) => s.setDisplayName);
  const setSoundEnabled = useSettingsStore((s) => s.setSoundEnabled);
  const setRefreshIntervalMs = useSettingsStore((s) => s.setRefreshIntervalMs);

  const [nameDraft, setNameDraft] = useState(displayName);

  const connState = state?.connectionState ?? null;
  const isOpen = connState === 'open';

  const handleRefresh = async () => {
    try {
      const res = await refreshConn.mutateAsync();
      toast.success(`Conexão: ${res.connectionState ?? 'desconhecida'}`);
    } catch {
      toast.error('Falha ao revalidar a conexão');
    }
  };
  const handleRetrySync = async () => {
    try {
      const res = await retrySync.mutateAsync();
      toast.success(`Sync: ${res.chatsImported} chats, ${res.messagesImported} mensagens`);
    } catch {
      toast.error('Falha ao resincronizar');
    }
  };
  const handleReconnect = () => {
    reconnectSocket();
    toast.success('Reconectando o tempo real…');
  };
  const handleLogout = async () => {
    try { await api('/api/v1/auth/logout', { method: 'POST', body: '{}' }); } catch { /* ignore */ }
    logout();
    router.replace('/login');
  };

  return (
    <motion.div
      className="p-6 max-w-3xl mx-auto"
      variants={pageTransition}
      initial="initial"
      animate="animate"
      transition={pageTransitionConfig}
    >
      <div className="mb-6">
        <h1 className="text-text-primary" style={{ fontWeight: 600, fontSize: 24 }}>Configurações</h1>
        <p className="text-sm text-text-secondary mt-0.5">Conexão, personalizações e conta</p>
      </div>

      <motion.div className="space-y-5" variants={staggerContainer} initial="initial" animate="animate">
        {/* CONEXÃO */}
        <Section icon={isOpen ? Wifi : WifiOff} title="Conexão" desc="Estado da instância WhatsApp e do tempo real. Atualize sob demanda.">
          <div className="flex items-center gap-3 flex-wrap mb-1">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
              style={{
                color: isOpen ? 'var(--success)' : 'var(--error)',
                background: isOpen ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                border: `1px solid ${isOpen ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}`,
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: isOpen ? 'var(--success)' : 'var(--error)' }} />
              Instância: {connState ?? 'desconhecida'}
            </span>
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
              style={{
                color: connected ? 'var(--success)' : 'var(--text-muted)',
                background: connected ? 'rgba(34,197,94,0.08)' : 'rgba(139,149,165,0.08)',
                border: `1px solid ${connected ? 'rgba(34,197,94,0.15)' : 'rgba(139,149,165,0.15)'}`,
              }}
            >
              Tempo real: {connected ? 'online' : 'offline'}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <ActionButton icon={RefreshCw} label="Revalidar instância" onClick={handleRefresh} loading={refreshConn.isPending} />
            <ActionButton icon={RotateCw} label="Resincronizar conversas" onClick={handleRetrySync} loading={retrySync.isPending} />
            <ActionButton icon={Radio} label="Reconectar tempo real" onClick={handleReconnect} />
          </div>
        </Section>

        {/* PERSONALIZAÇÕES */}
        <Section icon={Gauge} title="Personalizações" desc="Preferências salvas neste navegador.">
          {/* Display name */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm text-text-primary">Nome de exibição</div>
              <div className="text-xs text-text-muted">Mostrado na interface no lugar do e-mail.</div>
            </div>
            <div className="flex items-center gap-2">
              <input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                placeholder={claims.sub ?? 'Seu nome'}
                className="w-44 px-3 py-1.5 rounded-input text-sm text-text-primary outline-none focus-ring"
                style={{ background: 'var(--bg-base)', border: '1px solid var(--border-default)' }}
              />
              <button
                onClick={() => { setDisplayName(nameDraft.trim()); toast.success('Nome atualizado'); }}
                className="px-3 py-1.5 rounded-input text-sm btn-gradient-primary"
              >
                Salvar
              </button>
            </div>
          </div>

          {/* Sound */}
          <div className="flex items-center justify-between gap-4 pt-1">
            <div className="flex items-start gap-2">
              <Volume2 size={15} className="text-text-secondary mt-0.5" />
              <div>
                <div className="text-sm text-text-primary">Notificações sonoras</div>
                <div className="text-xs text-text-muted">Toca um som sutil ao chegar mensagem ou resposta da IA.</div>
              </div>
            </div>
            <Toggle checked={soundEnabled} onChange={(v) => { setSoundEnabled(v); }} />
          </div>

          {/* Auto-refresh */}
          <div className="flex items-center justify-between gap-4 pt-1">
            <div className="flex items-start gap-2">
              <RefreshCw size={15} className="text-text-secondary mt-0.5" />
              <div>
                <div className="text-sm text-text-primary">Atualização automática</div>
                <div className="text-xs text-text-muted">Intervalo de atualização das listas (conversas, leads, dashboard).</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {REFRESH_OPTIONS.map((opt) => {
                const active = refreshIntervalMs === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setRefreshIntervalMs(opt.value)}
                    className="px-2.5 py-1 rounded-input text-xs font-medium transition-colors duration-150"
                    style={{
                      background: active ? 'var(--gradient-primary)' : 'var(--bg-elevated)',
                      color: active ? 'var(--text-inverse)' : 'var(--text-secondary)',
                      border: '1px solid var(--border-default)',
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </Section>

        {/* APARÊNCIA */}
        <Section icon={Palette} title="Aparência" desc="Escolha o esquema de cores da interface.">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm text-text-primary">Tema</div>
              <div className="text-xs text-text-muted">Sistema segue a preferência do SO; Claro ou Escuro fixam a escolha.</div>
            </div>
            <ThemeToggle />
          </div>
        </Section>

        {/* CONTA */}
        <Section icon={User} title="Conta" desc="Sessão atual.">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs text-text-muted">E-mail</div>
              <div className="text-text-primary truncate">{claims.sub ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs text-text-muted">Instância</div>
              <div className="text-text-primary font-mono">{claims.instancia ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs text-text-muted">Papel</div>
              <div className="text-text-primary capitalize">{claims.role ?? '—'}</div>
            </div>
            {displayName && (
              <div>
                <div className="text-xs text-text-muted">Nome</div>
                <div className="text-text-primary truncate">{displayName}</div>
              </div>
            )}
          </div>
          <button
            onClick={handleLogout}
            className="mt-2 flex items-center gap-2 px-3.5 py-2 rounded-input text-sm text-error hover:bg-error/[0.08] transition-colors duration-150"
            style={{ border: '1px solid rgba(239,68,68,0.2)' }}
          >
            <LogOut size={14} />
            Sair da conta
          </button>
        </Section>
      </motion.div>
    </motion.div>
  );
}
