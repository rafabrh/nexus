'use client';

import { useEffect, useState } from 'react';
import { Film, Image as ImageIcon } from 'lucide-react';
import { apiBlob } from '@/lib/api';

/**
 * Miniatura da mídia de uma resposta rápida. A rota de serve exige JWT (um
 * `<img src>` cru não manda o Bearer), então imagem é baixada via `apiBlob` →
 * object URL (mesmo padrão do Avatar/áudio). Vídeo mostra só um ícone — não vale
 * baixar o binário inteiro para um thumbnail de lista.
 */
export function QuickReplyThumb({
  mediaId,
  type,
  size = 36,
}: {
  mediaId: string;
  type: 'image' | 'video';
  size?: number;
}) {
  const [objUrl, setObjUrl] = useState<string | null>(null);

  useEffect(() => {
    if (type !== 'image') return;
    let active = true;
    let created: string | null = null;
    apiBlob(`/api/v1/quick-replies/media/${mediaId}`)
      .then((blob) => {
        if (!active) return;
        created = URL.createObjectURL(blob);
        setObjUrl(created);
      })
      .catch(() => {
        /* sem preview — cai no ícone */
      });
    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
      setObjUrl(null);
    };
  }, [mediaId, type]);

  const box = {
    width: size,
    height: size,
    borderRadius: 6,
    border: '1px solid var(--separator)',
  } as const;

  if (type === 'image' && objUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={objUrl} alt="" className="object-cover flex-shrink-0" style={box} />
    );
  }

  return (
    <div
      className="flex items-center justify-center flex-shrink-0"
      style={{ ...box, background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
    >
      {type === 'video' ? <Film size={16} /> : <ImageIcon size={16} />}
    </div>
  );
}
