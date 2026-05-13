'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageBubble } from './message-bubble';
import { useMessages } from '@/hooks/use-messages';
import { MessageSquare } from 'lucide-react';
import type { Message } from '@nexus/shared';

interface MessageListProps {
  jid: string;
}

// Deterministic widths/heights to avoid random values on re-render
const SKELETON_ITEMS = [
  { width: '58%', height: '52px', align: 'justify-start' },
  { width: '42%', height: '36px', align: 'justify-end' },
  { width: '65%', height: '68px', align: 'justify-start' },
  { width: '38%', height: '36px', align: 'justify-end' },
  { width: '50%', height: '52px', align: 'justify-start' },
];

function MessageSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {SKELETON_ITEMS.map((item, i) => (
        <motion.div
          key={i}
          className={`flex ${item.align}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: i * 0.06, duration: 0.3 }}
        >
          <div
            className="skeleton rounded-lg"
            style={{ width: item.width, height: item.height }}
          />
        </motion.div>
      ))}
    </div>
  );
}

function TypingIndicator() {
  return (
    <motion.div
      className="flex justify-start mb-2"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
    >
      <div
        className="px-3 py-2 flex flex-col gap-1.5"
        style={{
          background: '#1A2029',
          border: '1px solid rgba(255,255,255,0.04)',
          borderRadius: '4px 12px 12px 12px',
        }}
      >
        {/* Label */}
        <span
          className="uppercase tracking-wide"
          style={{
            fontFamily: 'Inter, sans-serif',
            fontWeight: 500,
            fontSize: 10,
            color: 'var(--color-text-muted, #6b7280)',
            letterSpacing: '0.08em',
          }}
        >
          NEXUS IA
        </span>
        {/* Dots */}
        <div className="flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="rounded-full"
              style={{ width: 6, height: 6, background: '#2DD4BF', display: 'block' }}
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                delay: i * 0.2,
                ease: 'easeInOut',
              }}
            />
          ))}
        </div>
      </div>
    </motion.div>
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
        <motion.div
          className="flex flex-col items-center gap-3"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <div
            className="flex items-center justify-center"
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: '#141820',
              border: '1px solid #1E2530',
            }}
          >
            <MessageSquare size={24} className="text-text-muted" />
          </div>
          <p className="text-sm text-text-muted">Nenhuma mensagem</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      {/* Typing indicator slot — rendered via AnimatePresence if needed */}
      <div ref={bottomRef} />
    </div>
  );
}
