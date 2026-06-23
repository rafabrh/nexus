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
        className={cn(
          'max-w-[70%] px-3 py-2 text-sm',
          isUser
            ? 'bg-bubble-them text-text-primary rounded-[4px_16px_16px_16px]'
            : 'bg-accent-500 text-white rounded-[16px_4px_16px_16px]',
        )}
      >
        <MediaIndicator mediaType={message.mediaType} />
        <p className="whitespace-pre-wrap break-words leading-relaxed">
          {message.content}
        </p>
        {message.ts && (
          <div
            className={cn(
              'text-[10px] mt-1',
              isUser ? 'text-text-muted' : 'text-white/60',
            )}
          >
            {formatTime(message.ts)}
          </div>
        )}
      </div>
    </motion.div>
  );
}
