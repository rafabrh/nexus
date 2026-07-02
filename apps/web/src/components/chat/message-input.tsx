'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Zap, AlertTriangle, Paperclip } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSendMessage, useSendMedia } from '@/hooks/use-messages';
import { useQuickReplies } from '@/hooks/use-quick-replies';
import { useConversationStore } from '@/stores/conversation.store';
import { notify } from '@/lib/notify';
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
  const fileRef = useRef<HTMLInputElement>(null);
  const sendMedia = useSendMedia(jid);

  const hasText = text.trim().length > 0;

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
    sendMessage.mutate(trimmed, {
      onSuccess: () => {
        setText('');
        inputRef.current?.focus();
      },
      onError: () => notify.error('Erro ao enviar mensagem'),
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

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

      {/* Input area */}
      <div className="flex items-end gap-2 p-3">
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

        {/* Textarea */}
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
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
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-white rounded-lg"
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
              key="inactive"
              disabled
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-text-muted rounded-lg bg-bg-elevated"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 22 }}
            >
              <Send size={16} />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
