'use client';

import { useState } from 'react';

interface AvatarProps {
  name: string;
  url?: string | null;
  size?: number;
  /** Numa linha selecionada (fundo accent) o avatar clareia para contrastar. */
  selected?: boolean;
}

/**
 * Avatar de contato com tratamento liquid-glass: mostra a foto do WhatsApp quando
 * há `profilePicUrl`, com fallback gracioso nas iniciais. Um sheen especular no
 * topo, ring fino e sombra macOS dão profundidade tanto sobre a foto quanto sobre
 * as iniciais. Se a imagem falhar (URL do CDN do WhatsApp expira), cai nas
 * iniciais via `onError`.
 */
export function Avatar({ name, url, size = 36, selected = false }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const showImg = Boolean(url) && !failed;

  return (
    <div
      className="relative rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.34),
        fontWeight: 600,
        background: selected ? 'rgba(255,255,255,0.2)' : 'var(--bg-active)',
        color: selected ? 'rgba(255,255,255,0.92)' : 'var(--text-secondary)',
        boxShadow:
          'inset 0 0.5px 0.5px rgba(255,255,255,0.45), inset 0 0 0 0.5px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.14)',
      }}
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url as string}
          alt={name}
          width={size}
          height={size}
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="relative z-[1] select-none">{initials}</span>
      )}
      {/* Sheen especular no topo — o toque liquid-glass, sobre foto ou iniciais. */}
      <span
        aria-hidden
        className="absolute inset-0 pointer-events-none rounded-full"
        style={{
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.22) 0%, transparent 45%)',
        }}
      />
    </div>
  );
}
