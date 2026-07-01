'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { formatTime } from '@/lib/utils';
import { FileText, Headphones, ImageIcon } from 'lucide-react';
import { messageIncoming, messageOutgoing } from '@/lib/motion-variants';
import { apiBlob } from '@/lib/api';
import type { Message } from '@nexus/shared';

interface MessageBubbleProps {
  message: Message;
  jid: string;
}

/** Placeholders de mídia (sem legenda) — não viram texto na bolha. */
const MEDIA_PLACEHOLDERS = [
  '[imagem]',
  '[video]',
  '[audio]',
  '[sticker]',
  '[documento]',
  '[localizacao]',
  '[contato]',
];

function MediaIndicator({ mediaType }: { mediaType: Message['mediaType'] }) {
  if (mediaType === 'text') return null;

  const icons = {
    audio: <Headphones size={14} />,
    image: <ImageIcon size={14} />,
    document: <FileText size={14} />,
  };
  const labels = { audio: 'Audio', image: 'Imagem', document: 'Documento' };

  return (
    <div className="flex items-center gap-1.5 text-xs opacity-70 mb-1">
      {icons[mediaType]}
      <span>{labels[mediaType]}</span>
    </div>
  );
}

/**
 * Imagem da mensagem, buscada com autenticação (um `<img>` não envia o Bearer):
 * baixa via `apiBlob` → object URL. Skeleton enquanto carrega, fallback discreto
 * se a Evolution não devolver a mídia.
 */
function MediaImage({ jid, mediaId, alt }: { jid: string; mediaId: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    apiBlob(
      `/api/v1/conversations/${encodeURIComponent(jid)}/media/${encodeURIComponent(mediaId)}`,
    )
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [jid, mediaId]);

  if (failed) {
    return (
      <div className="flex items-center gap-1.5 text-xs opacity-70 mb-1">
        <ImageIcon size={14} /> imagem indisponível
      </div>
    );
  }
  if (!url) {
    return <div className="skeleton rounded-lg mb-1" style={{ width: 220, height: 160 }} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      className="rounded-lg mb-1 max-w-full cursor-zoom-in"
      style={{ maxHeight: 320, objectFit: 'cover' }}
      onClick={() => window.open(url, '_blank')}
    />
  );
}

export function MessageBubble({ message, jid }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isImage = message.mediaType === 'image' && !!message.mediaId;
  const showText = !!message.content && !MEDIA_PLACEHOLDERS.includes(message.content);

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
        {isImage ? (
          <MediaImage
            jid={jid}
            mediaId={message.mediaId as string}
            alt={showText ? message.content : 'Imagem'}
          />
        ) : (
          <MediaIndicator mediaType={message.mediaType} />
        )}
        {showText && (
          <p className="whitespace-pre-wrap break-words leading-relaxed">
            {message.content}
          </p>
        )}
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
