'use client';

import { useEffect, useState } from 'react';
import { apiBlob } from '@/lib/api';
import { useInView } from '@/hooks/use-in-view';

interface AvatarProps {
  name: string;
  /**
   * JID do contato. Caminho robusto da foto: baixa os bytes do proxy autenticado
   * (`/conversations/:jid/avatar`) via `apiBlob` → object URL. Um `<img src>` cru
   * não serve (não envia o Bearer). 404/erro → cai no `url` (se houver) e, por fim,
   * nas iniciais.
   */
  jid?: string;
  /** Fallback opcional: URL de foto já exposta pela API (CDN do WhatsApp). */
  url?: string | null;
  size?: number;
  /** Numa linha selecionada (fundo accent) o avatar clareia para contrastar. */
  selected?: boolean;
}

/**
 * Avatar de contato com tratamento liquid-glass: mostra a foto do WhatsApp com
 * fallback gracioso nas iniciais. Um sheen especular no topo, ring fino e sombra
 * macOS dão profundidade tanto sobre a foto quanto sobre as iniciais.
 *
 * A foto é buscada com autenticação pelo proxy do BFF a partir do `jid` (o Bearer
 * é obrigatório) e só quando o avatar entra em tela (`useInView`), para não disparar
 * centenas de requisições de uma vez na lista de conversas. O object URL é revogado
 * no cleanup.
 */
export function Avatar({ name, jid, url, size = 36, selected = false }: AvatarProps) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const [objUrl, setObjUrl] = useState<string | null>(null);
  const [proxyFailed, setProxyFailed] = useState(false);
  const [urlFailed, setUrlFailed] = useState(false);

  const initials = name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  // Foto via proxy autenticado (por jid). Só dispara quando visível.
  useEffect(() => {
    if (!jid || !inView) return;
    let active = true;
    let created: string | null = null;
    setProxyFailed(false);
    apiBlob(`/api/v1/conversations/${encodeURIComponent(jid)}/avatar`)
      .then((blob) => {
        if (!active) return;
        created = URL.createObjectURL(blob);
        setObjUrl(created);
      })
      .catch(() => {
        // 404 (sem foto) ou erro → tenta o fallback `url`, senão iniciais.
        if (active) setProxyFailed(true);
      });
    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
      setObjUrl(null);
    };
  }, [jid, inView]);

  // Fonte efetiva: blob do proxy > url de fallback (se o proxy falhou) > iniciais.
  const src = objUrl ?? (proxyFailed && url && !urlFailed ? url : null);
  const showImg = Boolean(src);

  return (
    <div
      ref={ref}
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
          src={src as string}
          alt={name}
          width={size}
          height={size}
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
          // Só o fallback `url` pode falhar por CDN expirado; o blob local não.
          onError={() => setUrlFailed(true)}
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
