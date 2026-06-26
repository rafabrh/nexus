'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Trash2, UserPlus, Wifi, WifiOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cardEntrance } from '@/lib/motion-variants';
import { notify } from '@/lib/notify';
import { useToggleTenant, useAddUser, useRemoveUser } from '@/hooks/use-admin';
import type { TenantEntry } from '@nexus/shared';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ConnBadge({ state }: { state?: string }) {
  if (state === 'open')
    return (
      <Badge variant="success">
        <Wifi size={11} /> Conectado
      </Badge>
    );
  if (state === 'connecting')
    return <Badge variant="warning">Conectando…</Badge>;
  return (
    <Badge variant="default">
      <WifiOff size={11} /> {state ?? 'sem conexão'}
    </Badge>
  );
}

function SyncBadge({ status }: { status?: string }) {
  if (!status) return null;
  const variant =
    status === 'done' ? 'success' : status === 'error' ? 'error' : 'warning';
  const label =
    status === 'done'
      ? 'sincronizado'
      : status === 'syncing'
        ? 'sincronizando…'
        : status === 'pending'
          ? 'sync pendente'
          : status;
  return <Badge variant={variant}>{label}</Badge>;
}

export function TenantCard({ tenant }: { tenant: TenantEntry }) {
  const toggle = useToggleTenant();
  const addUser = useAddUser();
  const removeUser = useRemoveUser();

  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'operator'>('operator');

  const onToggle = async (active: boolean) => {
    try {
      await toggle.mutateAsync({ instancia: tenant.instancia, active });
      notify.success(
        `${tenant.instancia} ${active ? 'ativado' : 'desativado'}`,
      );
    } catch {
      notify.error('Falha ao alterar o status do assinante');
    }
  };

  const onAddUser = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      notify.error('Email inválido');
      return;
    }
    if (tenant.users.some((u) => u.email.toLowerCase() === email)) {
      notify.error('Esse email já está nesse assinante');
      return;
    }
    try {
      await addUser.mutateAsync({ instancia: tenant.instancia, email, role: newRole });
      notify.success(`Usuário adicionado a ${tenant.instancia}`);
      setNewEmail('');
      setNewRole('operator');
    } catch {
      notify.error('Falha ao adicionar usuário');
    }
  };

  const onRemoveUser = async (email: string) => {
    try {
      await removeUser.mutateAsync({ instancia: tenant.instancia, email });
      notify.success('Usuário removido');
    } catch {
      notify.error('Falha ao remover usuário');
    }
  };

  return (
    <motion.div
      variants={cardEntrance}
      className="glass-card p-5"
      style={{
        border: '1px solid var(--glass-border)',
        borderRadius: 'var(--radius-panel)',
        opacity: tenant.active ? 1 : 0.6,
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-text-primary truncate">
            {tenant.name}
          </h3>
          <p className="text-xs text-text-muted font-mono truncate">
            {tenant.instancia}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-text-muted">
            {tenant.active ? 'Ativo' : 'Inativo'}
          </span>
          <Switch
            checked={tenant.active}
            onCheckedChange={onToggle}
            disabled={toggle.isPending}
            aria-label={`Ativar ou desativar ${tenant.instancia}`}
          />
        </div>
      </div>

      {/* Status */}
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        <ConnBadge state={tenant.connectionState} />
        <SyncBadge status={tenant.syncStatus} />
      </div>

      {/* Users */}
      <div className="space-y-1.5">
        <span
          className="text-[11px] font-semibold uppercase tracking-wide"
          style={{ color: 'var(--text-muted)' }}
        >
          Usuários ({tenant.users.length})
        </span>
        {tenant.users.map((u) => (
          <div
            key={u.email}
            className="group flex items-center justify-between gap-2 rounded-input px-2.5 py-1.5"
            style={{ background: 'var(--bg-active)' }}
          >
            <span className="text-xs text-text-primary truncate" title={u.email}>
              {u.email}
            </span>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <Badge variant={u.role === 'admin' ? 'primary' : 'default'}>
                {u.role}
              </Badge>
              <button
                onClick={() => onRemoveUser(u.email)}
                aria-label={`Remover ${u.email}`}
                className="text-text-muted hover:text-error opacity-0 group-hover:opacity-100 transition-opacity duration-150 focus-ring rounded"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add user */}
      <div className="mt-3 flex items-center gap-1.5">
        <Input
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          placeholder="adicionar email…"
          className="h-8 text-xs"
          onKeyDown={(e) => e.key === 'Enter' && onAddUser()}
        />
        <div
          className="flex items-center rounded-input p-0.5 flex-shrink-0"
          style={{ background: 'var(--bg-active)', border: '1px solid var(--border-default)' }}
        >
          {(['operator', 'admin'] as const).map((r) => {
            const active = newRole === r;
            return (
              <button
                key={r}
                onClick={() => setNewRole(r)}
                className="px-2 py-1 rounded text-[11px] font-medium transition-colors duration-150"
                style={{
                  background: active ? 'var(--accent-500)' : 'transparent',
                  color: active ? '#fff' : 'var(--text-secondary)',
                }}
              >
                {r === 'operator' ? 'Operador' : 'Admin'}
              </button>
            );
          })}
        </div>
        <Button
          variant="secondary"
          size="icon"
          onClick={onAddUser}
          disabled={addUser.isPending}
          aria-label="Adicionar usuário"
        >
          <UserPlus size={14} />
        </Button>
      </div>
    </motion.div>
  );
}
