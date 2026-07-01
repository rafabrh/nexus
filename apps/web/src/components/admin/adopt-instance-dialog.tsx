'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAdoptInstance } from '@/hooks/use-admin';
import { notify } from '@/lib/notify';

// Sem hífen: o nome vira segmento de chave Redis (chat:{inst}:{jid}), e '-'
// quebraria o roteamento — igual à validação do backend.
const INSTANCE_RE = /^[a-zA-Z0-9_]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/.+/;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Instâncias já cadastradas — bloqueia duplicata antes de chamar a API. */
  existingInstances: string[];
}

export function AdoptInstanceDialog({ open, onOpenChange, existingInstances }: Props) {
  const [instancia, setInstancia] = useState('');
  const [email, setEmail] = useState('');
  const [n8nUrl, setN8nUrl] = useState('');
  const adopt = useAdoptInstance();

  const inst = instancia.trim();
  const mail = email.trim().toLowerCase();
  const url = n8nUrl.trim();
  const instValid = INSTANCE_RE.test(inst);
  const mailValid = EMAIL_RE.test(mail);
  const urlValid = URL_RE.test(url);
  const duplicate = existingInstances.some((i) => i.toLowerCase() === inst.toLowerCase());
  const canSubmit = instValid && mailValid && urlValid && !duplicate && !adopt.isPending;

  const reset = () => {
    setInstancia('');
    setEmail('');
    setN8nUrl('');
  };

  const submit = async () => {
    if (!canSubmit) return;
    try {
      await adopt.mutateAsync({ instancia: inst, adminEmail: mail, n8nWebhookUrl: url });
      notify.success(`Instância "${inst}" adotada`);
      reset();
      onOpenChange(false);
    } catch {
      notify.error('Falha ao adotar a instância');
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
      title="Adotar instância existente"
    >
      <div className="space-y-4">
        <p className="text-xs text-text-muted">
          Vincula ao painel uma instância que <span className="font-semibold">já existe na Evolution</span>{' '}
          (ex.: a Shkgroup), sem recriá-la. Informe o nome exato e a URL do webhook do fluxo N8N dela.
        </p>

        <div>
          <label className="mb-1.5 block text-xs text-text-muted">
            Instância (nome exato na Evolution)
          </label>
          <Input
            value={instancia}
            onChange={(e) => setInstancia(e.target.value)}
            placeholder="Shkgroup"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          {inst && !instValid && (
            <p className="mt-1 text-xs text-error">
              Apenas letras, números e underscore (sem hífen).
            </p>
          )}
          {duplicate && (
            <p className="mt-1 text-xs text-error">Já existe um assinante com essa instância.</p>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-xs text-text-muted">Email do administrador</label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="dono@cliente.com"
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          {mail && !mailValid && <p className="mt-1 text-xs text-error">Email inválido.</p>}
        </div>

        <div>
          <label className="mb-1.5 block text-xs text-text-muted">URL do webhook N8N</label>
          <Input
            value={n8nUrl}
            onChange={(e) => setN8nUrl(e.target.value)}
            placeholder="https://n8n…/webhook/shkgroupwpp"
            className="font-mono text-xs"
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          {url && !urlValid && (
            <p className="mt-1 text-xs text-error">Informe uma URL http(s) válida.</p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="primary" size="sm" onClick={submit} disabled={!canSubmit}>
            {adopt.isPending ? 'Adotando…' : 'Adotar'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
