'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useRegisterTenant } from '@/hooks/use-admin';
import { notify } from '@/lib/notify';

const INSTANCE_RE = /^[a-zA-Z0-9_-]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing instance names — used to block duplicates before hitting the API. */
  existingInstances: string[];
}

export function NewTenantDialog({ open, onOpenChange, existingInstances }: Props) {
  const [instancia, setInstancia] = useState('');
  const [email, setEmail] = useState('');
  const register = useRegisterTenant();

  const inst = instancia.trim();
  const mail = email.trim().toLowerCase();
  const instValid = INSTANCE_RE.test(inst);
  const mailValid = EMAIL_RE.test(mail);
  const duplicate = existingInstances.some(
    (i) => i.toLowerCase() === inst.toLowerCase(),
  );
  const canSubmit = instValid && mailValid && !duplicate && !register.isPending;

  const reset = () => {
    setInstancia('');
    setEmail('');
  };

  const submit = async () => {
    if (!canSubmit) return;
    try {
      await register.mutateAsync({ instancia: inst, adminEmail: mail });
      notify.success(`Assinante "${inst}" cadastrado`);
      reset();
      onOpenChange(false);
    } catch {
      notify.error('Falha ao cadastrar assinante');
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
      title="Novo assinante"
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs text-text-muted">
            Instância (nome na Evolution)
          </label>
          <Input
            value={instancia}
            onChange={(e) => setInstancia(e.target.value)}
            placeholder="ClienteX"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          {inst && !instValid && (
            <p className="mt-1 text-xs text-error">
              Use apenas letras, números, hífen e underscore.
            </p>
          )}
          {duplicate && (
            <p className="mt-1 text-xs text-error">
              Já existe um assinante com essa instância.
            </p>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-xs text-text-muted">
            Email do administrador
          </label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="cliente@empresa.com"
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          {mail && !mailValid && (
            <p className="mt-1 text-xs text-error">Email inválido.</p>
          )}
        </div>

        <p className="text-xs text-text-muted">
          O cliente recebe acesso por magic link nesse email e cria a conexão do
          WhatsApp em <span className="font-mono">/connect</span>.
        </p>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" size="sm" onClick={submit} disabled={!canSubmit}>
            {register.isPending ? 'Cadastrando…' : 'Cadastrar'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
