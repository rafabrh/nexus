'use client';

import { cn } from '@/lib/utils';
import { formatTime } from '@/lib/utils';
import { FileText, Headphones, ImageIcon } from 'lucide-react';
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
    <div
      className={cn(
        'flex mb-2',
        isUser ? 'justify-start' : 'justify-end',
      )}
    >
      <div
        className={cn(
          'max-w-[70%] px-3 py-2 text-sm',
          isUser
            ? 'bg-bg-elevated text-text-primary rounded-tl-badge rounded-tr-card rounded-br-card rounded-bl-card'
            : 'bg-primary-800 text-text-primary rounded-tl-card rounded-tr-badge rounded-br-badge rounded-bl-card',
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
              isUser ? 'text-text-muted' : 'text-primary-400/60',
            )}
          >
            {formatTime(message.ts)}
          </div>
        )}
      </div>
    </div>
  );
}
