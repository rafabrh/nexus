'use client';

import { useState } from 'react';
import {
  X,
  User,
  Bot,
  Layers,
  Tag,
  StickyNote,
  Zap,
  Clock,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Flame,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useUiStore } from '@/stores/ui.store';
import {
  useConversationDetail,
  useAiControl,
  useToggleAi,
  useAddNote,
  useDeleteNote,
  useAddTag,
  useDeleteTag,
  useUpdateStage,
  useToggleHot,
} from '@/hooks/use-conversations';
import { useQuickReplies } from '@/hooks/use-quick-replies';
import { useReminders, useCreateReminder } from '@/hooks/use-reminders';
import { FunnelStage, type AiState, type FunnelStageKey } from '@nexus/shared';
import { timeAgo } from '@/lib/utils';

interface DetailPanelProps {
  jid: string;
}

function Section({
  title,
  icon: Icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors duration-150"
      >
        <Icon size={14} className="text-text-muted" />
        <span className="flex-1 text-left">{title}</span>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

export function DetailPanel({ jid }: DetailPanelProps) {
  const { detailPanelOpen, setDetailPanelOpen } = useUiStore();
  const { data: detail } = useConversationDetail(jid);
  const { data: aiControl } = useAiControl(jid);
  const toggleAi = useToggleAi(jid);
  const addNote = useAddNote(jid);
  const deleteNote = useDeleteNote(jid);
  const addTag = useAddTag(jid);
  const deleteTag = useDeleteTag(jid);
  const updateStage = useUpdateStage(jid);
  const toggleHot = useToggleHot(jid);
  const { data: quickReplies } = useQuickReplies();
  const { data: reminders } = useReminders('pending');
  const createReminder = useCreateReminder();

  const [noteText, setNoteText] = useState('');
  const [tagText, setTagText] = useState('');
  const [reminderText, setReminderText] = useState('');
  const [reminderMinutes, setReminderMinutes] = useState('30');

  const stages = FunnelStage.all();
  const jidReminders = reminders?.filter((r) => r.jid === jid) ?? [];

  const handleAiToggle = (state: AiState) => {
    const expireAt =
      state === 'OFF_UNTIL'
        ? new Date(Date.now() + 30 * 60000).toISOString()
        : undefined;
    toggleAi.mutate({ state, expireAt }, {
      onSuccess: () => toast.success(`IA ${state === 'ON' ? 'ativada' : 'desativada'}`),
      onError: () => toast.error('Erro ao alterar IA'),
    });
  };

  const handleAddNote = () => {
    if (!noteText.trim()) return;
    addNote.mutate(noteText.trim(), {
      onSuccess: () => {
        setNoteText('');
        toast.success('Nota adicionada');
      },
      onError: () => toast.error('Erro ao adicionar nota'),
    });
  };

  const handleAddTag = () => {
    if (!tagText.trim()) return;
    addTag.mutate(tagText.trim(), {
      onSuccess: () => {
        setTagText('');
        toast.success('Tag adicionada');
      },
      onError: () => toast.error('Erro ao adicionar tag'),
    });
  };

  const handleAddReminder = () => {
    if (!reminderText.trim()) return;
    const mins = parseInt(reminderMinutes, 10) || 30;
    createReminder.mutate(
      {
        jid,
        text: reminderText.trim(),
        triggerAt: Date.now() + mins * 60000,
      },
      {
        onSuccess: () => {
          setReminderText('');
          toast.success('Lembrete criado');
        },
        onError: () => toast.error('Erro ao criar lembrete'),
      },
    );
  };

  return (
    <AnimatePresence>
      {detailPanelOpen && (
        <motion.aside
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="fixed top-12 right-0 bottom-0 w-[380px] bg-bg-surface border-l border-border z-40 flex flex-col overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-text-primary">Detalhes</h3>
            <button
              onClick={() => setDetailPanelOpen(false)}
              className="text-text-muted hover:text-text-secondary transition-colors duration-150"
            >
              <X size={16} />
            </button>
          </div>

          {!detail ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 skeleton" />
              ))}
            </div>
          ) : (
            <>
              {/* Lead Info */}
              <Section title="Lead" icon={User}>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-text-muted">Nome</span>
                    <span className="text-text-primary">{detail.contactName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Telefone</span>
                    <span className="text-text-primary font-mono text-xs">{detail.phoneDisplay}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Mensagens</span>
                    <span className="text-text-primary">{detail.messageCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-text-muted">Hot Lead</span>
                    <button
                      onClick={() => toggleHot.mutate(!detail.isHot)}
                      className={cn(
                        'flex items-center gap-1 px-2 py-0.5 rounded-badge text-xs transition-colors duration-150',
                        detail.isHot
                          ? 'bg-warning/15 text-warning'
                          : 'bg-bg-hover text-text-muted hover:text-text-secondary',
                      )}
                    >
                      <Flame size={12} />
                      {detail.isHot ? 'Sim' : 'Nao'}
                    </button>
                  </div>
                </div>
              </Section>

              {/* AI Control */}
              <Section title="Controle IA" icon={Bot}>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-text-muted">Status:</span>
                    <Badge
                      variant={
                        aiControl?.state === 'ON'
                          ? 'success'
                          : aiControl?.state === 'OFF_UNTIL'
                          ? 'warning'
                          : 'default'
                      }
                    >
                      {aiControl?.state === 'ON'
                        ? 'Ativa'
                        : aiControl?.state === 'OFF_UNTIL'
                        ? 'Pausada'
                        : 'Desligada'}
                    </Badge>
                    {aiControl?.until && (
                      <span className="text-xs text-text-muted">
                        ate {timeAgo(aiControl.until)}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      size="xs"
                      variant={aiControl?.state === 'ON' ? 'success' : 'secondary'}
                      onClick={() => handleAiToggle('ON')}
                      disabled={toggleAi.isPending}
                    >
                      Ligar
                    </Button>
                    <Button
                      size="xs"
                      variant={aiControl?.state === 'OFF_UNTIL' ? 'danger' : 'secondary'}
                      onClick={() => handleAiToggle('OFF_UNTIL')}
                      disabled={toggleAi.isPending}
                    >
                      Pausar 30min
                    </Button>
                    <Button
                      size="xs"
                      variant={aiControl?.state === 'OFF' ? 'danger' : 'secondary'}
                      onClick={() => handleAiToggle('OFF')}
                      disabled={toggleAi.isPending}
                    >
                      Desligar
                    </Button>
                  </div>
                </div>
              </Section>

              {/* Funnel Stage */}
              <Section title="Etapa do Funil" icon={Layers}>
                <div className="space-y-1">
                  {stages.map((s) => (
                    <button
                      key={s.key}
                      onClick={() => {
                        if (s.key !== detail.stage) {
                          updateStage.mutate(s.key, {
                            onSuccess: () => toast.success(`Etapa: ${s.label}`),
                          });
                        }
                      }}
                      className={cn(
                        'w-full flex items-center gap-2 px-2 py-1.5 rounded-badge text-xs transition-colors duration-150',
                        s.key === detail.stage
                          ? 'bg-bg-active text-text-primary'
                          : 'text-text-muted hover:bg-bg-hover hover:text-text-secondary',
                      )}
                    >
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: s.color }}
                      />
                      <span>{s.label}</span>
                      {s.key === detail.stage && (
                        <span className="ml-auto text-primary-400">atual</span>
                      )}
                    </button>
                  ))}
                </div>
              </Section>

              {/* Tags */}
              <Section title="Tags" icon={Tag}>
                <div className="flex flex-wrap gap-1 mb-2">
                  {detail.tags.length === 0 && (
                    <span className="text-xs text-text-muted">Sem tags</span>
                  )}
                  {detail.tags.map((t) => (
                    <Badge key={t} variant="primary" className="group cursor-pointer">
                      {t}
                      <button
                        onClick={() => deleteTag.mutate(t)}
                        className="ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={10} />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <Input
                    placeholder="Nova tag..."
                    value={tagText}
                    onChange={(e) => setTagText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                    className="h-7 text-xs"
                  />
                  <Button size="xs" variant="secondary" onClick={handleAddTag}>
                    <Plus size={12} />
                  </Button>
                </div>
              </Section>

              {/* Notes */}
              <Section title="Notas" icon={StickyNote}>
                <div className="space-y-1.5 mb-2 max-h-32 overflow-y-auto">
                  {(!detail.notes || detail.notes.length === 0) && (
                    <span className="text-xs text-text-muted">Sem notas</span>
                  )}
                  {detail.notes?.map((note, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 p-2 rounded-badge bg-bg-elevated text-xs text-text-secondary group"
                    >
                      <span className="flex-1">{note}</span>
                      <button
                        onClick={() => deleteNote.mutate(i)}
                        className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-error transition-all"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <Input
                    placeholder="Nova nota..."
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
                    className="h-7 text-xs"
                  />
                  <Button size="xs" variant="secondary" onClick={handleAddNote}>
                    <Plus size={12} />
                  </Button>
                </div>
              </Section>

              {/* Quick Replies */}
              <Section title="Respostas Rapidas" icon={Zap} defaultOpen={false}>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {(!quickReplies || quickReplies.length === 0) && (
                    <span className="text-xs text-text-muted">Nenhuma resposta rapida</span>
                  )}
                  {quickReplies?.map((qr) => (
                    <div
                      key={qr.id}
                      className="p-2 rounded-badge bg-bg-elevated text-xs text-text-secondary"
                    >
                      <div className="font-medium text-text-primary">{qr.name}</div>
                      <div className="text-text-muted mt-0.5 truncate">{qr.content}</div>
                    </div>
                  ))}
                </div>
              </Section>

              {/* Reminders */}
              <Section title="Lembretes" icon={Clock} defaultOpen={false}>
                <div className="space-y-1.5 mb-2 max-h-32 overflow-y-auto">
                  {jidReminders.length === 0 && (
                    <span className="text-xs text-text-muted">Sem lembretes</span>
                  )}
                  {jidReminders.map((r) => (
                    <div
                      key={r.id}
                      className="p-2 rounded-badge bg-bg-elevated text-xs text-text-secondary"
                    >
                      <div>{r.text}</div>
                      <div className="text-text-muted mt-0.5">
                        {new Date(r.triggerAt).toLocaleString('pt-BR')}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <Input
                    placeholder="Texto do lembrete..."
                    value={reminderText}
                    onChange={(e) => setReminderText(e.target.value)}
                    className="h-7 text-xs"
                  />
                  <div className="flex gap-1.5">
                    <select
                      value={reminderMinutes}
                      onChange={(e) => setReminderMinutes(e.target.value)}
                      className="h-7 px-2 text-xs rounded-badge bg-bg-elevated border border-border text-text-primary"
                    >
                      <option value="15">15 min</option>
                      <option value="30">30 min</option>
                      <option value="60">1 hora</option>
                      <option value="120">2 horas</option>
                      <option value="1440">Amanha</option>
                    </select>
                    <Button size="xs" variant="secondary" onClick={handleAddReminder}>
                      <Plus size={12} /> Criar
                    </Button>
                  </div>
                </div>
              </Section>
            </>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
