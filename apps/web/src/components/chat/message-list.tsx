'use client';

import { useEffect, useRef } from 'react';
import { MessageBubble } from './message-bubble';
import { useMessages } from '@/hooks/use-messages';
import type { Message } from '@nexus/shared';

interface MessageListProps {
  jid: string;
}

function MessageSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}
        >
          <div
            className="skeleton"
            style={{
              width: `${Math.floor(Math.random() * 40 + 30)}%`,
              height: `${Math.floor(Math.random() * 20 + 36)}px`,
            }}
          />
        </div>
      ))}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start mb-2">
      <div className="bg-bg-elevated rounded-card px-3 py-2 flex items-center gap-1">
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </div>
    </div>
  );
}

export function MessageList({ jid }: MessageListProps) {
  const { data: messages, isLoading } = useMessages(jid);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (isLoading) return <MessageSkeleton />;

  if (!messages || messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <p className="text-sm text-text-muted">Nenhuma mensagem</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
