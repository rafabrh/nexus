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
  Plus,
  Trash2,
  Flame,
  RotateCcw,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useUiStore } from '@/stores/ui.store';
import { useConversationStore } from '@/stores/conversation.store';
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
  useResetConversation,
} from '@/hooks/use-conversations';
import {
  useQuickReplies,
  useCreateQuickReply,
  useDeleteQuickReply,
} from '@/hooks/use-quick-replies';
import { useReminders, useCreateReminder } from '@/hooks/use-reminders';
import { FunnelStage, type AiState, type FunnelStageKey } from '@nexus/shared';
import { timeAgo } from '@/lib/utils';
import { slideInRight, staggerItem } from '@/lib/motion-variants';
import { stageColorToken } from '@/lib/stage-colors';

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
    <div style={{ borderBottom: '1px solid var(--separator)' }} className="last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors duration-150"
        style={{ borderRadius: 0 }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <Icon size={14} className="text-text-muted" />
        <span className="flex-1 text-left">{title}</span>
        <motion.div
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 24 }}
        >
          <ChevronDown size={14} />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className="px-4 pb-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function DetailPanel({ jid }: DetailPanelProps) {
  const { detailPanelOpen, setDetailPanelOpen } = useUiStore();
  const insertIntoComposer = useConversationStore((s) => s.insertIntoComposer);
  const { data: detail } = useConversationDetail(jid);
  const { data: aiControl } = useAiControl(jid);
  const toggleAi = useToggleAi(jid);
  const addNote = useAddNote(jid);
  const deleteNote = useDeleteNote(jid);
  const addTag = useAddTag(jid);
  const deleteTag = useDeleteTag(jid);
  const updateStage = useUpdateStage(jid);
  const toggleHot = useToggleHot(jid);
  const resetConversation = useResetConversation(jid);
  const { data: quickReplies } = useQuickReplies();
  const createQuickReply = useCreateQuickReply();
  const deleteQuickReply = useDeleteQuickReply();
  const { data: reminders } = useReminders('pending');
  const createReminder = useCreateReminder();

  const [noteText, setNoteText] = useState('');
  const [tagText, setTagText] = useState('');
  const [reminderText, setReminderText] = useState('');
  const [reminderMinutes, setReminderMinutes] = useState('30');
  const [qrName, setQrName] = useState('');
  const [qrContent, setQrContent] = useState('');

  const stages = FunnelStage.all();
  const jidReminders = reminders?.filter((r) => r.jid === jid) ?? [];

  // ON = reativa; OFF = desliga por 24h (comando `off`).
  const handleAiToggle = (state: AiState) => {
    const label = state === 'ON' ? 'ativada' : 'desligada por 24h';
    toggleAi.mutate({ state }, {
      onSuccess: () => toast.success(`IA ${label}`),
      onError: () => toast.error('Erro ao alterar IA'),
    });
  };

  // OFF_UNTIL com duração flexível (comando `off + tempo`).
  const handleAiPause = (minutes: number, label: string) => {
    const expireAt = new Date(Date.now() + minutes * 60000).toISOString();
    toggleAi.mutate({ state: 'OFF_UNTIL', expireAt }, {
      onSuccess: () => toast.success(`IA pausada por ${label}`),
      onError: () => toast.error('Erro ao alterar IA'),
    });
  };

  // Comando `reset`: reativa a IA e limpa flags transitórias (escopo seguro).
  const handleReset = () => {
    if (!window.confirm('Resetar o estado deste lead? Reativa a IA e limpa flags transitórias. Histórico, etapa, tags e notas são mantidos.')) return;
    resetConversation.mutate(undefined, {
      onSuccess: () => toast.success('Estado resetado — IA reativada'),
      onError: () => toast.error('Erro ao resetar estado'),
    });
  };

  const handleAddQuickReply = () => {
    if (!qrName.trim() || !qrContent.trim()) return;
    createQuickReply.mutate(
      { name: qrName.trim(), content: qrContent.trim() },
      {
        onSuccess: () => {
          setQrName('');
          setQrContent('');
          toast.success('Resposta rápida salva');
        },
        onError: () => toast.error('Erro ao salvar resposta'),
      },
    );
  };

  const PAUSE_OPTIONS = [
    { label: '30min', m: 30 },
    { label: '1h', m: 60 },
    { label: '2h', m: 120 },
    { label: '6h', m: 360 },
  ];

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

  const isAiOn = aiControl?.state === 'ON';

  return (
    <AnimatePresence>
      {detailPanelOpen && (
        <motion.aside
          variants={slideInRight}
          initial="initial"
          animate="animate"
          exit="exit"
          className="vibrancy-panel fixed top-12 right-0 bottom-0 w-[380px] z-40 flex flex-col overflow-y-auto"
          style={{
            borderLeft: '1px solid var(--separator)',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 flex-shrink-0"
            style={{ borderBottom: '1px solid var(--separator)' }}
          >
            <h3 className="text-sm font-semibold text-text-primary">Detalhes</h3>
            <button
              onClick={() => setDetailPanelOpen(false)}
              aria-label="Fechar painel de detalhes"
              className="flex items-center justify-center text-text-muted hover:text-text-secondary transition-colors duration-150 focus-ring"
              style={{
                width: 28,
                height: 28,
                borderRadius: 'var(--radius-input)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
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
                <div
                  className="space-y-2 text-sm p-3 rounded-lg"
                  style={{
                    background: 'var(--glass-bg)',
                    border: '1px solid var(--separator)',
                    borderRadius: 'var(--radius-panel)',
                  }}
                >
                  <div className="flex justify-between">
                    <span className="text-text-muted">Nome</span>
                    <span className="text-text-primary">{detail.contactName}</span>
                  </div>
                  <div className="flex justify-between" style={{ borderTop: '1px solid var(--separator)', paddingTop: 8 }}>
                    <span className="text-text-muted">Telefone</span>
                    <span className="text-text-primary font-mono text-xs">{detail.phoneDisplay}</span>
                  </div>
                  <div className="flex justify-between" style={{ borderTop: '1px solid var(--separator)', paddingTop: 8 }}>
                    <span className="text-text-muted">Mensagens</span>
                    <span className="text-text-primary">{detail.messageCount}</span>
                  </div>
                  <div className="flex items-center justify-between" style={{ borderTop: '1px solid var(--separator)', paddingTop: 8 }}>
                    <span className="text-text-muted">Hot Lead</span>
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={() => toggleHot.mutate(!detail.isHot)}
                      className={cn(
                        'flex items-center gap-1 px-2 py-0.5 text-xs transition-colors duration-150',
                        detail.isHot
                          ? 'text-warning'
                          : 'text-text-muted hover:text-text-secondary',
                      )}
                      style={{
                        borderRadius: 'var(--radius-input)',
                        background: detail.isHot ? 'color-mix(in srgb, var(--warning) 15%, transparent)' : 'var(--bg-elevated)',
                        border: '1px solid var(--separator)',
                        boxShadow: detail.isHot ? '0 0 8px 1px color-mix(in srgb, var(--warning) 25%, transparent)' : undefined,
                      }}
                    >
                      <Flame
                        size={12}
                        style={
                          detail.isHot
                            ? { filter: 'drop-shadow(0 0 4px color-mix(in srgb, var(--warning) 60%, transparent))' }
                            : undefined
                        }
                      />
                      {detail.isHot ? 'Sim' : 'Nao'}
                    </motion.button>
                  </div>
                </div>
              </Section>

              {/* AI Control */}
              <Section title="Controle IA" icon={Bot}>
                <div className="space-y-3">
                  {/* Main ON/OFF toggle with Switch */}
                  <div
                    className="flex items-center justify-between p-3"
                    style={{
                      background: 'var(--glass-bg)',
                      border: '1px solid var(--separator)',
                      borderRadius: 'var(--radius-panel)',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <Bot
                        size={14}
                        style={{ color: isAiOn ? 'var(--ai-on)' : 'var(--text-muted)' }}
                      />
                      <div>
                        <div className="text-sm font-medium text-text-primary">IA</div>
                        <div className="text-xs" style={{ color: isAiOn ? 'var(--ai-on)' : aiControl?.state === 'OFF_UNTIL' ? 'var(--ai-paused)' : 'var(--ai-off)' }}>
                          {aiControl?.state === 'ON'
                            ? 'Ativa'
                            : aiControl?.state === 'OFF_UNTIL'
                            ? `Pausada${aiControl?.until ? ` — ate ${timeAgo(aiControl.until)}` : ''}`
                            : 'Desligada'}
                        </div>
                      </div>
                    </div>
                    <Switch
                      checked={isAiOn}
                      onCheckedChange={(checked) => handleAiToggle(checked ? 'ON' : 'OFF')}
                      disabled={toggleAi.isPending}
                      aria-label="Ligar ou desligar IA"
                    />
                  </div>

                  {/* Pausar por tempo flexível (comando off + tempo) */}
                  <div
                    className="p-3 space-y-2"
                    style={{
                      background: 'var(--glass-bg)',
                      border: '1px solid var(--separator)',
                      borderRadius: 'var(--radius-panel)',
                    }}
                  >
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs text-text-muted">Pausar por:</span>
                      {PAUSE_OPTIONS.map((opt) => (
                        <motion.button
                          key={opt.label}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleAiPause(opt.m, opt.label)}
                          disabled={toggleAi.isPending}
                          className="px-2 py-0.5 text-xs font-medium text-text-secondary transition-colors duration-150 disabled:opacity-50"
                          style={{
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--separator)',
                            borderRadius: 'var(--radius-input)',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                        >
                          {opt.label}
                        </motion.button>
                      ))}
                    </div>

                    {/* Reset (comando reset) */}
                    <button
                      onClick={handleReset}
                      disabled={resetConversation.isPending}
                      className="flex items-center gap-1.5 px-2 py-1 text-xs text-text-muted hover:text-error transition-colors duration-150 disabled:opacity-50"
                      style={{ borderRadius: 'var(--radius-input)' }}
                    >
                      <RotateCcw size={12} className={resetConversation.isPending ? 'animate-spin' : ''} />
                      Resetar estado do lead
                    </button>
                  </div>
                </div>
              </Section>

              {/* Funnel Stage */}
              <Section title="Etapa do Funil" icon={Layers}>
                <div
                  className="space-y-1 p-2"
                  style={{
                    background: 'var(--glass-bg)',
                    border: '1px solid var(--separator)',
                    borderRadius: 'var(--radius-panel)',
                  }}
                >
                  {stages.map((s) => {
                    const isCurrent = s.key === detail.stage;
                    const stageToken = stageColorToken(s.key);
                    return (
                      <button
                        key={s.key}
                        onClick={() => {
                          if (!isCurrent) {
                            updateStage.mutate(s.key as FunnelStageKey, {
                              onSuccess: () => toast.success(`Etapa: ${s.label}`),
                            });
                          }
                        }}
                        className="w-full flex items-center gap-2 px-2 py-1.5 text-xs transition-colors duration-150"
                        style={{
                          borderRadius: 'var(--radius-input)',
                          background: isCurrent ? `color-mix(in srgb, ${stageToken} 12%, transparent)` : 'transparent',
                          borderLeft: isCurrent ? `2px solid ${stageToken}` : '2px solid transparent',
                          color: isCurrent ? 'var(--text-primary)' : 'var(--text-muted)',
                          paddingLeft: isCurrent ? 6 : 8,
                        }}
                        onMouseEnter={(e) => {
                          if (!isCurrent) e.currentTarget.style.background = 'var(--bg-hover)';
                        }}
                        onMouseLeave={(e) => {
                          if (!isCurrent) e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: stageToken }}
                        />
                        <span>{s.label}</span>
                        {isCurrent && (
                          <span className="ml-auto" style={{ color: 'var(--accent-500)' }}>atual</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </Section>

              {/* Tags */}
              <Section title="Tags" icon={Tag}>
                <div className="flex flex-wrap gap-1 mb-2">
                  {detail.tags.length === 0 && (
                    <span className="text-xs text-text-muted">Sem tags</span>
                  )}
                  <AnimatePresence>
                    {detail.tags.map((t) => (
                      <motion.div
                        key={t}
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                      >
                        <Badge variant="primary" className="group cursor-pointer">
                          {t}
                          <button
                            onClick={() => deleteTag.mutate(t)}
                            className="ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X size={10} />
                          </button>
                        </Badge>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
                <div className="flex gap-1.5">
                  <Input
                    placeholder="Nova tag..."
                    value={tagText}
                    onChange={(e) => setTagText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                    className="h-7 text-xs"
                  />
                  <motion.div whileTap={{ scale: 0.97 }}>
                    <Button size="xs" variant="secondary" onClick={handleAddTag}>
                      <Plus size={12} />
                    </Button>
                  </motion.div>
                </div>
              </Section>

              {/* Notes */}
              <Section title="Notas" icon={StickyNote}>
                <div className="space-y-1.5 mb-2 max-h-32 overflow-y-auto">
                  {(!detail.notes || detail.notes.length === 0) && (
                    <span className="text-xs text-text-muted">Sem notas</span>
                  )}
                  <AnimatePresence>
                    {detail.notes?.map((note, i) => (
                      <motion.div
                        key={i}
                        variants={staggerItem}
                        initial="initial"
                        animate="animate"
                        exit={{ opacity: 0, y: -4, transition: { duration: 0.15 } }}
                        className="flex items-start gap-2 p-2 text-xs text-text-secondary group"
                        style={{
                          background: 'var(--glass-bg)',
                          border: '1px solid var(--separator)',
                          borderRadius: 'var(--radius-input)',
                        }}
                      >
                        <span className="flex-1">{note}</span>
                        <button
                          onClick={() => deleteNote.mutate(i)}
                          className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-error transition-all"
                        >
                          <Trash2 size={12} />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
                <div className="flex gap-1.5">
                  <Input
                    placeholder="Nova nota..."
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
                    className="h-7 text-xs"
                  />
                  <motion.div whileTap={{ scale: 0.97 }}>
                    <Button size="xs" variant="secondary" onClick={handleAddNote}>
                      <Plus size={12} />
                    </Button>
                  </motion.div>
                </div>
              </Section>

              {/* Quick Replies — create/list/delete */}
              <Section title="Respostas Rapidas" icon={Zap} defaultOpen={false}>
                <div className="space-y-1.5 mb-2 max-h-40 overflow-y-auto">
                  {(!quickReplies || quickReplies.length === 0) && (
                    <span className="text-xs text-text-muted">Nenhuma resposta rapida</span>
                  )}
                  <AnimatePresence>
                    {quickReplies?.map((qr) => (
                      <motion.div
                        key={qr.id}
                        variants={staggerItem}
                        initial="initial"
                        animate="animate"
                        exit={{ opacity: 0, y: -4, transition: { duration: 0.15 } }}
                        className="p-2 text-xs group transition-colors duration-150"
                        style={{
                          background: 'var(--glass-bg)',
                          border: '1px solid var(--separator)',
                          borderRadius: 'var(--radius-input)',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--glass-bg)')}
                      >
                        <div className="flex items-start gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              insertIntoComposer(qr.content);
                              toast.success('Resposta inserida no chat');
                            }}
                            title="Clique para preencher o chat (voce edita e envia)"
                            className="flex-1 min-w-0 text-left cursor-pointer"
                          >
                            <div className="font-medium text-text-primary">{qr.name}</div>
                            <div className="text-text-muted mt-0.5">{qr.content}</div>
                          </button>
                          <button
                            onClick={() => deleteQuickReply.mutate(qr.id, { onSuccess: () => toast.success('Resposta removida') })}
                            className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-error transition-all flex-shrink-0"
                            aria-label="Remover resposta rapida"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>

                {/* Create a new personalized quick reply */}
                <div className="space-y-1.5">
                  <Input
                    placeholder="Nome (ex: Saudacao)"
                    value={qrName}
                    onChange={(e) => setQrName(e.target.value)}
                    className="h-7 text-xs"
                  />
                  <div className="flex gap-1.5">
                    <Input
                      placeholder="Mensagem personalizada..."
                      value={qrContent}
                      onChange={(e) => setQrContent(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddQuickReply()}
                      className="h-7 text-xs"
                    />
                    <motion.div whileTap={{ scale: 0.97 }}>
                      <Button
                        size="xs"
                        variant="secondary"
                        onClick={handleAddQuickReply}
                        disabled={createQuickReply.isPending}
                      >
                        <Plus size={12} />
                      </Button>
                    </motion.div>
                  </div>
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
                      className="p-2 text-xs text-text-secondary"
                      style={{
                        background: 'var(--glass-bg)',
                        border: '1px solid var(--separator)',
                        borderRadius: 'var(--radius-input)',
                      }}
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
                      className="h-7 px-2 text-xs text-text-primary"
                      style={{
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--separator)',
                        borderRadius: 'var(--radius-input)',
                      }}
                    >
                      <option value="15">15 min</option>
                      <option value="30">30 min</option>
                      <option value="60">1 hora</option>
                      <option value="120">2 horas</option>
                      <option value="1440">Amanha</option>
                    </select>
                    <motion.div whileTap={{ scale: 0.97 }}>
                      <Button size="xs" variant="secondary" onClick={handleAddReminder}>
                        <Plus size={12} /> Criar
                      </Button>
                    </motion.div>
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
