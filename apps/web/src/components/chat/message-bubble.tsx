'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { formatTime } from '@/lib/utils';
import { FileText, Headphones, ImageIcon } from 'lucide-react';
import { messageIncoming, messageOutgoing } from '@/lib/motion-variants';
import type { Message } from '@nexus/shared';

interface MessageBubbleProps {
  message: Message;
}

function MediaIndicator({ mediaType }: { mediaType: Message['mediaType'] }) {
  if (mediaType === 'text') return null;

  const icons = {
    audio: <Headphones size={14} />,
    image: <ImageIcon size={14} />,
    document: <FileText size={14} />,
  };

  const labels = {
    audio: 'Audio',
    image: 'Imagem',
    document: 'Documento',
  };

  return (
    <div className="flex items-center gap-1.5 text-xs text-text-muted mb-1">
      {icons[mediaType]}
      <span>{labels[mediaType]}</span>
    </div>
  );
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <motion.div
      className={cn('flex mb-2', isUser ? 'justify-start' : 'justify-end')}
      variants={isUser ? messageIncoming : messageOutgoing}
      initial="initial"
      animate="animate"
    >
      <div
        className="max-w-[70%] px-3 py-2 text-sm text-text-primary"
        style={
          isUser
            ? {
                background: '#1A2029',
                border: '1px solid rgba(255,255,255,0.04)',
                borderRadius: '4px 12px 12px 12px',
              }
            : {
                background:
                  'linear-gradient(135deg, rgba(139,92,246,0.14), rgba(13,148,136,0.10))',
                border: '1px solid rgba(139,92,246,0.16)',
                borderRadius: '12px 4px 12px 12px',
              }
        }
      >
        <MediaIndicator mediaType={message.mediaType} />
        <p className="whitespace-pre-wrap break-words leading-relaxed">
          {message.content}
        </p>
        {message.ts && (
          <div
            className={cn('text-[10px] mt-1')}
            style={
              isUser
                ? { color: 'var(--color-text-muted, #6b7280)' }
                : { color: 'rgba(45,212,191,0.4)' }
            }
          >
            {formatTime(message.ts)}
          </div>
        )}
      </div>
    </motion.div>
  );
}
