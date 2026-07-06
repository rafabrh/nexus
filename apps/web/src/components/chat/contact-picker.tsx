'use client';

import { useMemo, useState } from 'react';
import { Search, User, Check } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { useConversations } from '@/hooks/use-conversations';
import { useSendContact } from '@/hooks/use-messages';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';

interface ContactPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jid: string;
}

/** Extrai só os dígitos do jid (parte local antes do @) para o phoneNumber. */
function jidToNumber(jid: string): string {
  return jid.split('@')[0]?.replace(/\D/g, '') ?? '';
}

/**
 * Picker de contato: fonte = lista de conversas (useConversations). Busca por
 * nome/telefone, seleciona um → deriva fullName (contactName) e phoneNumber (do
 * jid) → useSendContact. Só lista chats individuais (@s.whatsapp.net).
 */
export function ContactPicker({ open, onOpenChange, jid }: ContactPickerProps) {
  const { data: conversations } = useConversations();
  const sendContact = useSendContact(jid);
  const [query, setQuery] = useState('');
  const [selectedJid, setSelectedJid] = useState<string | null>(null);

  const items = useMemo(() => {
    const list = (conversations ?? []).filter(
      (c) => c.jid.endsWith('@s.whatsapp.net') && c.jid !== jid,
    );
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (c) =>
        c.contactName.toLowerCase().includes(q) ||
        c.phoneDisplay.toLowerCase().includes(q),
    );
  }, [conversations, query, jid]);

  const reset = () => {
    setQuery('');
    setSelectedJid(null);
  };

  const submit = () => {
    const chosen = (conversations ?? []).find((c) => c.jid === selectedJid);
    if (!chosen) return;
    sendContact.mutate(
      {
        fullName: chosen.contactName,
        phoneNumber: jidToNumber(chosen.jid),
      },
      {
        onSuccess: () => {
          notify.success('Contato enviado');
          reset();
          onOpenChange(false);
        },
        onError: () => notify.error('Erro ao enviar contato'),
      },
    );
  };

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
      title="Enviar contato"
    >
      <div className="space-y-3">
        {/* Busca */}
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--text-muted)' }}
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar contato…"
            autoFocus
            className="h-9 w-full rounded-input pl-9 pr-3 text-base text-text-primary placeholder:text-text-muted focus:outline-none"
            style={{
              background: 'var(--control-fill)',
              border: '1px solid var(--border-default)',
              boxShadow: 'inset 0 1px 2px var(--control-shadow)',
            }}
          />
        </div>

        {/* Lista de contatos */}
        <div className="max-h-72 overflow-y-auto -mx-1 px-1">
          {items.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-muted">
              Nenhum contato encontrado.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {items.map((c) => {
                const selected = c.jid === selectedJid;
                return (
                  <li key={c.jid}>
                    <button
                      type="button"
                      onClick={() => setSelectedJid(c.jid)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-list-item px-2.5 py-2 text-left transition-colors duration-150 focus-ring',
                        selected ? '' : 'hover:bg-bg-hover',
                      )}
                      style={
                        selected
                          ? {
                              background:
                                'color-mix(in srgb, var(--accent-500) 14%, transparent)',
                            }
                          : undefined
                      }
                    >
                      {/* Avatar (foto ou iniciais) */}
                      <span
                        className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full text-white"
                        style={{ background: 'var(--accent-500)' }}
                      >
                        {c.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={c.avatarUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <User size={16} />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-text-primary">
                          {c.contactName}
                        </span>
                        <span className="block truncate text-xs text-text-muted">
                          {c.phoneDisplay}
                        </span>
                      </span>
                      {selected && (
                        <Check
                          size={16}
                          className="flex-shrink-0"
                          style={{ color: 'var(--accent-500)' }}
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={submit}
            disabled={!selectedJid || sendContact.isPending}
          >
            {sendContact.isPending ? 'Enviando…' : 'Enviar'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
