'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Zap, AlertTriangle, Paperclip, X, Mic, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSendMessage, useSendMedia, useSendAudio } from '@/hooks/use-messages';
import { useQuickReplies } from '@/hooks/use-quick-replies';
import { useVoiceRecorder } from '@/hooks/use-voice-recorder';
import { useConversationStore } from '@/stores/conversation.store';
import { notify } from '@/lib/notify';
import { EmojiPickerButton } from './emoji-picker';
import type { AiState, QuickReply } from '@nexus/shared';

interface MessageInputProps {
  jid: string;
  aiState: AiState;
}

export function MessageInput({ jid, aiState }: MessageInputProps) {
  const [text, setText] = useState('');
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const sendMessage = useSendMessage(jid);
  const { data: quickReplies } = useQuickReplies();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const composerInsert = useConversationStore((s) => s.composerInsert);
  const clearComposerInsert = useConversationStore((s) => s.clearComposerInsert);
  const replyingTo = useConversationStore((s) => s.replyingTo);
  const clearReplyingTo = useConversationStore((s) => s.clearReplyingTo);
  const fileRef = useRef<HTMLInputElement>(null);
  const sendMedia = useSendMedia(jid);
  const sendAudio = useSendAudio(jid);
  const recorder = useVoiceRecorder();

  const startRecording = async () => {
    const ok = await recorder.start();
    if (!ok) notify.error('Não foi possível acessar o microfone');
  };

  const sendRecording = async () => {
    const rec = await recorder.stop();
    if (!rec) return;
    sendAudio.mutate(
      { audio: rec.base64, mimetype: rec.mimetype },
      {
        onSuccess: () => notify.success('Áudio enviado'),
        onError: () => notify.error('Erro ao enviar áudio'),
      },
    );
  };
  // Última posição do cursor no textarea — para inserir emoji no lugar certo
  // mesmo quando o foco está no popover do picker.
  const caretRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });

  const hasText = text.trim().length > 0;

  const rememberCaret = () => {
    const el = inputRef.current;
    if (!el) return;
    caretRef.current = {
      start: el.selectionStart ?? el.value.length,
      end: el.selectionEnd ?? el.value.length,
    };
  };

  // Insere o emoji na posição do cursor (não concatena no fim). Usa a forma
  // funcional do setState para ser correto sob inserções rápidas.
  const insertEmoji = (emoji: string) => {
    setText((prev) => {
      const start = Math.min(caretRef.current.start, prev.length);
      const end = Math.min(caretRef.current.end, prev.length);
      const next = prev.slice(0, start) + emoji + prev.slice(end);
      const pos = start + emoji.length;
      caretRef.current = { start: pos, end: pos };
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (!el) return;
        // Só reposiciona a seleção se o textarea ainda tem foco — reposicionar
        // enquanto o picker está aberto fecharia o popover.
        if (document.activeElement === el) el.setSelectionRange(pos, pos);
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 96) + 'px';
      });
      return next;
    });
  };

  // Ao fechar o picker, devolve o foco ao textarea na posição do cursor.
  const handleEmojiOpenChange = (open: boolean) => {
    if (open) return;
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      const { start, end } = caretRef.current;
      el.setSelectionRange(start, end);
    });
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite reenviar o mesmo arquivo
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) {
      notify.error('Arquivo muito grande (máx 16MB)');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      const mediatype = file.type.startsWith('image/')
        ? 'image'
        : file.type.startsWith('video/')
          ? 'video'
          : 'document';
      sendMedia.mutate(
        {
          mediatype,
          media: base64,
          fileName: file.name,
          mimetype: file.type,
          caption: text.trim() || undefined,
        },
        {
          onSuccess: () => {
            setText('');
            notify.success('Mídia enviada');
          },
          onError: () => notify.error('Erro ao enviar mídia'),
        },
      );
    };
    reader.readAsDataURL(file);
  };

  // Fill (never send) the composer when a quick reply is clicked elsewhere
  // (detail panel). Appends if the operator already typed something.
  useEffect(() => {
    if (!composerInsert) return;
    setText((prev) => (prev.trim() ? `${prev} ${composerInsert.text}` : composerInsert.text));
    clearComposerInsert();
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 96) + 'px';
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
  }, [composerInsert, clearComposerInsert]);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const reply = replyingTo;
    sendMessage.mutate(
      {
        text: trimmed,
        quotedId: reply?.id,
        // Citação otimista para a bolha já nascer com o bloco citado.
        quoted: reply
          ? { id: reply.id, preview: reply.preview, fromMe: reply.fromMe }
          : null,
      },
      {
        onSuccess: () => {
          setText('');
          caretRef.current = { start: 0, end: 0 };
          clearReplyingTo();
          inputRef.current?.focus();
        },
        onError: () => notify.error('Erro ao enviar mensagem'),
      },
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else if (e.key === 'Escape' && replyingTo) {
      // Esc cancela a resposta em andamento (paridade WhatsApp).
      e.preventDefault();
      clearReplyingTo();
    }
  };

  // Ao acionar "responder" numa bolha, foca o composer para digitar a resposta.
  useEffect(() => {
    if (replyingTo) inputRef.current?.focus();
  }, [replyingTo]);

  const handleQuickReply = (qr: QuickReply) => {
    setText(qr.content);
    setShowQuickReplies(false);
    inputRef.current?.focus();
  };

  return (
    <div
      className="flex-shrink-0 glass mirror"
      style={{
        borderTop: '1px solid var(--separator)',
        boxShadow: 'inset 0 1px 0 var(--mirror-edge)',
      }}
    >
      {/* AI warning */}
      {aiState === 'ON' && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-warning/5 border-b border-warning/10">
          <AlertTriangle size={12} className="text-warning" />
          <span className="text-xs text-warning">
            IA ativa nesta conversa. Sua mensagem desativara a IA automaticamente.
          </span>
        </div>
      )}

      {/* Quick replies dropdown */}
      {showQuickReplies && quickReplies && quickReplies.length > 0 && (
        <div className="border-b border-border bg-bg-elevated max-h-40 overflow-y-auto">
          {quickReplies.map((qr) => (
            <button
              key={qr.id}
              onClick={() => handleQuickReply(qr)}
              className="w-full text-left px-4 py-2 hover:bg-bg-hover transition-colors duration-150"
            >
              <div className="text-xs font-medium text-text-primary">
                {qr.name}
                {qr.shortcut && (
                  <span className="ml-2 text-text-muted font-mono">
                    /{qr.shortcut}
                  </span>
                )}
              </div>
              <div className="text-xs text-text-muted truncate mt-0.5">
                {qr.content}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Barra de citação (responder) — estilo WhatsApp: barra accent à esquerda,
          preview truncado e X para cancelar. Anima altura/opacidade ao entrar/sair. */}
      <AnimatePresence initial={false}>
        {replyingTo && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={{ overflow: 'hidden', borderBottom: '1px solid var(--separator)' }}
          >
            <div className="flex items-center gap-2 px-3 py-2">
              <div
                className="flex-1 min-w-0 flex items-stretch gap-2 rounded-lg overflow-hidden"
                style={{ background: 'var(--bg-hover)' }}
              >
                <span
                  aria-hidden
                  style={{ width: 3, background: 'var(--accent-500)', flexShrink: 0 }}
                />
                <div className="min-w-0 py-1.5 pr-2">
                  <div
                    className="text-xs font-medium"
                    style={{ color: 'var(--accent-500)' }}
                  >
                    {replyingTo.fromMe ? 'Você' : 'Contato'}
                  </div>
                  <div
                    className="text-xs truncate"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {replyingTo.preview}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={clearReplyingTo}
                aria-label="Cancelar resposta"
                className="flex-shrink-0 w-7 h-7 rounded-input flex items-center justify-center text-text-muted hover:text-text-secondary hover:bg-bg-hover transition-colors duration-150 focus-ring"
              >
                <X size={15} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Barra de gravação de voz — substitui o composer enquanto grava. */}
      <AnimatePresence initial={false}>
        {recorder.isRecording && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className="flex items-center gap-3 p-3">
          <button
            type="button"
            onClick={recorder.cancel}
            aria-label="Cancelar gravação"
            title="Cancelar"
            className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-colors duration-150 focus-ring hover:[background:color-mix(in_srgb,var(--error)_12%,transparent)]"
            style={{ color: 'var(--error)' }}
          >
            <Trash2 size={17} />
          </button>
          <div className="flex-1 flex items-center gap-2 min-w-0">
            <span
              className="rounded-full flex-shrink-0"
              style={{
                width: 10,
                height: 10,
                background: 'var(--error)',
                animation: 'recording-pulse 1.4s ease-in-out infinite',
              }}
            />
            <span className="text-sm tabular-nums" style={{ color: 'var(--text-secondary)' }}>
              {Math.floor(recorder.seconds / 60)}:
              {String(recorder.seconds % 60).padStart(2, '0')}
            </span>
            <span className="text-sm truncate" style={{ color: 'var(--text-muted)' }}>
              Gravando…
            </span>
          </div>
          <button
            type="button"
            onClick={sendRecording}
            disabled={sendAudio.isPending}
            aria-label="Enviar áudio"
            title="Enviar"
            className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white disabled:opacity-50 transition-transform duration-150 active:scale-95 focus-ring"
            style={{ background: 'var(--accent-500)' }}
          >
            <Send size={16} />
          </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input area */}
      <div className={cn('flex items-end gap-2 p-3', recorder.isRecording && 'hidden')}>
        {/* Quick replies toggle */}
        <button
          onClick={() => setShowQuickReplies(!showQuickReplies)}
          className={cn(
            'flex-shrink-0 w-8 h-8 rounded-input flex items-center justify-center transition-colors duration-150',
            showQuickReplies
              ? 'bg-primary-800/40 text-primary-400'
              : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover',
          )}
          aria-label="Respostas rapidas"
          title="Respostas rapidas"
        >
          <Zap size={16} />
        </button>

        {/* Anexar mídia */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
          className="hidden"
          onChange={handleFile}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={sendMedia.isPending}
          className="flex-shrink-0 w-8 h-8 rounded-input flex items-center justify-center text-text-muted hover:text-text-secondary hover:bg-bg-hover transition-colors duration-150 disabled:opacity-50"
          aria-label="Anexar arquivo"
          title="Anexar imagem, vídeo ou documento"
        >
          <Paperclip size={16} />
        </button>

        {/* Emoji — popover liquid-glass; insere na posição do cursor */}
        <EmojiPickerButton onSelect={insertEmoji} onOpenChange={handleEmojiOpenChange} />

        {/* Textarea */}
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            rememberCaret();
          }}
          onKeyDown={handleKeyDown}
          onKeyUp={rememberCaret}
          onClick={rememberCaret}
          onSelect={rememberCaret}
          placeholder="Digite uma mensagem..."
          rows={1}
          className="flex-1 resize-none text-sm text-text-primary placeholder:text-text-muted focus:outline-none transition-colors duration-150 max-h-24 min-h-[36px]"
          style={{
            background: 'var(--control-fill)',
            border: '1px solid var(--border-default)',
            borderRadius: 10,
            padding: '8px 12px',
            height: 'auto',
            overflow: 'hidden',
          }}
          onFocus={(e) => {
            (e.target as HTMLTextAreaElement).style.border =
              '1px solid var(--border-active)';
            (e.target as HTMLTextAreaElement).style.boxShadow =
              '0 0 0 3px color-mix(in srgb, var(--accent-500) 15%, transparent)';
          }}
          onBlur={(e) => {
            // Guarda o cursor antes de o foco ir para o picker de emoji.
            rememberCaret();
            (e.target as HTMLTextAreaElement).style.border =
              '1px solid var(--border-default)';
            (e.target as HTMLTextAreaElement).style.boxShadow = 'none';
          }}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = 'auto';
            target.style.height = Math.min(target.scrollHeight, 96) + 'px';
          }}
        />

        {/* Send button with Framer Motion spring transition */}
        <AnimatePresence mode="wait" initial={false}>
          {hasText ? (
            <motion.button
              key="active"
              onClick={handleSend}
              disabled={sendMessage.isPending}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-white rounded-lg focus-ring disabled:opacity-50"
              style={{
                background: 'var(--accent-500)',
              }}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 22 }}
              whileHover={{
                filter: 'brightness(1.1)',
              }}
              whileTap={{ scale: 0.93 }}
            >
              <Send size={16} />
            </motion.button>
          ) : (
            <motion.button
              key="mic"
              onClick={startRecording}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-text-muted hover:text-text-secondary hover:bg-bg-hover rounded-lg transition-colors duration-150 focus-ring"
              aria-label="Gravar áudio"
              title="Gravar nota de voz"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 22 }}
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.93 }}
            >
              <Mic size={16} />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
