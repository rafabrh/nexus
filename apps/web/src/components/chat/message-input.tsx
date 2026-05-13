'use client';

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Zap, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSendMessage } from '@/hooks/use-messages';
import { useQuickReplies } from '@/hooks/use-quick-replies';
import { toast } from 'sonner';
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

  const hasText = text.trim().length > 0;

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    sendMessage.mutate(trimmed, {
      onSuccess: () => {
        setText('');
        inputRef.current?.focus();
      },
      onError: () => toast.error('Erro ao enviar mensagem'),
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
      className="flex-shrink-0"
      style={{
        background: 'rgba(20,24,32,0.72)',
        backdropFilter: 'blur(12px) saturate(1.2)',
        WebkitBackdropFilter: 'blur(12px) saturate(1.2)',
        borderTop: '1px solid rgba(255,255,255,0.04)',
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
            background: '#0C0F12',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 10,
            padding: '8px 12px',
            height: 'auto',
            overflow: 'hidden',
          }}
          onFocus={(e) => {
            (e.target as HTMLTextAreaElement).style.border =
              '1px solid rgba(13,148,136,0.6)';
            (e.target as HTMLTextAreaElement).style.boxShadow =
              '0 0 0 3px rgba(13,148,136,0.1)';
          }}
          onBlur={(e) => {
            (e.target as HTMLTextAreaElement).style.border =
              '1px solid rgba(255,255,255,0.06)';
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
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-white"
              style={{
                background: 'linear-gradient(135deg, #0d9488, #10b981)',
                borderRadius: 8,
                boxShadow: '0 0 0 0px rgba(13,148,136,0)',
              }}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 22 }}
              whileHover={{
                boxShadow: '0 0 12px rgba(13,148,136,0.45)',
              }}
              whileTap={{ scale: 0.93 }}
            >
              <Send size={16} />
            </motion.button>
          ) : (
            <motion.button
              key="inactive"
              disabled
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-text-muted"
              style={{ background: '#141820', borderRadius: 8 }}
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
