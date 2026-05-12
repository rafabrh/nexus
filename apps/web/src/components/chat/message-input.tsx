'use client';

import { useState, useRef } from 'react';
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
    <div className="border-t border-border bg-bg-surface flex-shrink-0">
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
        <button
          onClick={() => setShowQuickReplies(!showQuickReplies)}
          className={cn(
            'flex-shrink-0 w-8 h-8 rounded-input flex items-center justify-center transition-colors duration-150',
            showQuickReplies
              ? 'bg-primary-800/40 text-primary-400'
              : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover',
          )}
          title="Respostas rapidas"
        >
          <Zap size={16} />
        </button>

        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Digite uma mensagem..."
          rows={1}
          className="flex-1 resize-none bg-bg-elevated border border-border rounded-input px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary-600 transition-colors duration-150 max-h-24 min-h-[36px]"
          style={{ height: 'auto', overflow: 'hidden' }}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = 'auto';
            target.style.height = Math.min(target.scrollHeight, 96) + 'px';
          }}
        />

        <button
          onClick={handleSend}
          disabled={!text.trim() || sendMessage.isPending}
          className={cn(
            'flex-shrink-0 w-8 h-8 rounded-input flex items-center justify-center transition-colors duration-150',
            text.trim()
              ? 'bg-primary-600 text-text-primary hover:bg-primary-500'
              : 'text-text-muted bg-bg-elevated',
          )}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
