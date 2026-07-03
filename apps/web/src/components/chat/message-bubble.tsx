'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { cn, formatTime } from '@/lib/utils';
import { renderRichText, stripFormatting } from '@/lib/rich-text';
import {
  FileText,
  Headphones,
  ImageIcon,
  CornerUpLeft,
  Video,
  Check,
  CheckCheck,
  Clock,
} from 'lucide-react';
import { messageIncoming, messageOutgoing } from '@/lib/motion-variants';
import { apiBlob } from '@/lib/api';
import { useConversationStore } from '@/stores/conversation.store';
import { useInView } from '@/hooks/use-in-view';
import { AudioPlayer } from './audio-player';
import type { Message } from '@nexus/shared';

interface MessageBubbleProps {
  message: Message;
  jid: string;
  /** Rola até a mensagem citada (âncora `data-msg-id`) e a destaca. */
  onJumpTo?: (id: string) => void;
  /** Flash de destaque quando esta bolha é o alvo de um "ir para a citação". */
  highlighted?: boolean;
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

/** Trecho curto para a barra de resposta e o bloco citado. */
function previewOf(m: Message): string {
  if (m.content && !MEDIA_PLACEHOLDERS.includes(m.content)) return stripFormatting(m.content);
  switch (m.mediaType) {
    case 'image':
      return 'Foto';
    case 'audio':
      return 'Áudio';
    case 'video':
      return 'Vídeo';
    case 'document':
      return 'Documento';
    default:
      return m.content || 'Mensagem';
  }
}

function MediaIndicator({ mediaType }: { mediaType: Message['mediaType'] }) {
  if (mediaType === 'text') return null;

  const icons = {
    audio: <Headphones size={14} />,
    image: <ImageIcon size={14} />,
    video: <Video size={14} />,
    document: <FileText size={14} />,
  };
  const labels = { audio: 'Audio', image: 'Imagem', video: 'Vídeo', document: 'Documento' };

  return (
    <div className="flex items-center gap-1.5 text-xs opacity-70 mb-1">
      {icons[mediaType as keyof typeof icons]}
      <span>{labels[mediaType as keyof typeof labels]}</span>
    </div>
  );
}

/**
 * Imagem da mensagem, buscada com autenticação (um `<img>` não envia o Bearer):
 * baixa via `apiBlob` → object URL, e só quando entra em tela (`useInView`).
 * Skeleton enquanto carrega, fallback discreto se a Evolution não devolver a mídia.
 */
function MediaImage({ jid, mediaId, alt }: { jid: string; mediaId: string; alt: string }) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!inView) return;
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
  }, [jid, mediaId, inView]);

  return (
    <div ref={ref}>
      {failed ? (
        <div className="flex items-center gap-1.5 text-xs opacity-70 mb-1">
          <ImageIcon size={14} /> imagem indisponível
        </div>
      ) : !url ? (
        <div className="skeleton rounded-lg mb-1" style={{ width: 220, height: 160 }} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={alt}
          className="rounded-lg mb-1 max-w-full cursor-zoom-in"
          style={{ maxHeight: 320, objectFit: 'cover' }}
          onClick={() => window.open(url, '_blank')}
        />
      )}
    </div>
  );
}

/**
 * Bloco citado renderizado ACIMA do conteúdo: barra vertical accent, rótulo do
 * autor e preview truncado, em tom sutil. Clicar rola até a mensagem original.
 * `outgoing` = bolha accent (branca) → contraste em branco; senão bolha "them".
 */
function QuotedBlock({
  quoted,
  outgoing,
  onClick,
}: {
  quoted: NonNullable<Message['quoted']>;
  outgoing: boolean;
  onClick: () => void;
}) {
  const barColor = outgoing ? 'rgba(255,255,255,0.85)' : 'var(--accent-500)';
  const bg = outgoing
    ? 'rgba(255,255,255,0.16)'
    : 'color-mix(in srgb, var(--accent-500) 14%, var(--bg-hover))';
  const border = outgoing
    ? undefined
    : '1px solid color-mix(in srgb, var(--accent-500) 24%, transparent)';
  const labelColor = outgoing ? '#ffffff' : 'var(--accent-500)';
  const previewColor = outgoing ? 'rgba(255,255,255,0.78)' : 'var(--text-secondary)';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Ir para a mensagem citada"
      className="w-full text-left mb-1 rounded-md overflow-hidden flex items-stretch gap-2 transition-opacity duration-150 hover:opacity-90"
      style={{ background: bg, border }}
    >
      <span aria-hidden style={{ width: 3, background: barColor, flexShrink: 0 }} />
      <span className="min-w-0 block py-1 pr-2">
        <span className="block text-[11px] font-medium" style={{ color: labelColor }}>
          {quoted.fromMe ? 'Você' : 'Contato'}
        </span>
        <span className="block text-xs truncate" style={{ color: previewColor }}>
          {stripFormatting(quoted.preview)}
        </span>
      </span>
    </button>
  );
}

/** Botão discreto "responder", revelado no hover da bolha. */
function ReplyButton({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label="Responder"
      title="Responder"
      className="flex-shrink-0 self-center w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity duration-150 focus-ring"
      style={{
        background: 'var(--glass-bg)',
        border: '1px solid var(--glass-border)',
        color: 'var(--text-secondary)',
        boxShadow: 'inset 0 1px 0 var(--mirror-edge), var(--shadow-control)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.9 }}
    >
      <CornerUpLeft size={13} />
    </motion.button>
  );
}

/**
 * Tiques de confirmação da mensagem de SAÍDA, estilo WhatsApp, sobre a bolha accent:
 * relógio (enviando) → ✓ (enviado) → ✓✓ translúcido (entregue) → ✓✓ branco forte
 * (lido/reproduzido). Sem status → nada (ainda sem ACK).
 */
function MessageStatus({ status }: { status?: Message['status'] }) {
  if (!status) return null;
  if (status === 'pending') return <Clock size={12} className="text-white/45" />;
  if (status === 'sent') return <Check size={12} className="text-white/55" />;
  const read = status === 'read' || status === 'played';
  return (
    <CheckCheck
      size={12}
      className={read ? '' : 'text-white/70'}
      style={read ? { color: '#ffffff' } : undefined}
    />
  );
}

export function MessageBubble({ message, jid, onJumpTo, highlighted = false }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isImage = message.mediaType === 'image' && !!message.mediaId;
  const isAudio = message.mediaType === 'audio' && !!message.mediaId;
  const showText = !!message.content && !MEDIA_PLACEHOLDERS.includes(message.content);
  const setReplyingTo = useConversationStore((s) => s.setReplyingTo);

  const startReply = () =>
    setReplyingTo({
      id: message.id,
      preview: previewOf(message),
      // role 'assistant' = saiu do operador/IA.
      fromMe: message.role === 'assistant',
    });

  const replyButton = <ReplyButton onClick={startReply} />;

  return (
    <motion.div
      data-msg-id={message.id}
      className={cn(
        'group flex mb-2 items-center gap-2',
        isUser ? 'justify-start' : 'justify-end',
      )}
      variants={isUser ? messageIncoming : messageOutgoing}
      initial="initial"
      animate="animate"
    >
      {/* Enviadas (à direita): botão responder à ESQUERDA da bolha. */}
      {!isUser && replyButton}

      <div
        className={cn(
          'relative max-w-[70%] px-3 py-2 text-sm',
          isUser
            ? 'bg-bubble-them text-text-primary rounded-[4px_16px_16px_16px]'
            : 'bg-accent-500 text-white rounded-[16px_4px_16px_16px]',
        )}
        style={{
          transition: 'box-shadow 0.25s var(--ease-out)',
          boxShadow: highlighted
            ? !isUser
              ? '0 0 0 2px rgba(255,255,255,0.65), 0 0 20px color-mix(in srgb, var(--accent-500) 55%, transparent)'
              : '0 0 0 2px var(--accent-500), 0 0 12px color-mix(in srgb, var(--accent-500) 40%, transparent)'
            : undefined,
        }}
      >
        {/* Bloco citado (responder) acima do conteúdo. */}
        {message.quoted && (
          <QuotedBlock
            quoted={message.quoted}
            outgoing={!isUser}
            onClick={() => message.quoted && onJumpTo?.(message.quoted.id)}
          />
        )}

        {isImage ? (
          <MediaImage
            jid={jid}
            mediaId={message.mediaId as string}
            alt={showText ? message.content : 'Imagem'}
          />
        ) : isAudio ? (
          <AudioPlayer jid={jid} mediaId={message.mediaId as string} isUser={isUser} />
        ) : (
          <MediaIndicator mediaType={message.mediaType} />
        )}

        {showText && (
          <p className="whitespace-pre-wrap break-words leading-relaxed">
            {renderRichText(message.content)}
          </p>
        )}

        {(message.ts || (!isUser && message.status)) && (
          <div
            className={cn(
              'flex items-center gap-1 mt-1',
              isUser ? 'justify-start' : 'justify-end',
            )}
          >
            {message.ts && (
              <span
                className={cn(
                  'text-[10px]',
                  isUser ? 'text-text-muted' : 'text-white/60',
                )}
              >
                {formatTime(message.ts)}
              </span>
            )}
            {!isUser && <MessageStatus status={message.status} />}
          </div>
        )}
      </div>

      {/* Recebidas (à esquerda): botão responder à DIREITA da bolha. */}
      {isUser && replyButton}
    </motion.div>
  );
}
