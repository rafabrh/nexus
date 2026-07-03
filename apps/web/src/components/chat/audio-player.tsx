'use client';

import { useEffect, useRef, useState } from 'react';
import { Play, Pause, Headphones } from 'lucide-react';
import { apiBlob } from '@/lib/api';
import { useInView } from '@/hooks/use-in-view';

interface AudioPlayerProps {
  jid: string;
  mediaId: string;
  /** Bolha recebida (them) → controles em accent; enviada → controles em branco. */
  isUser: boolean;
}

// Alturas fixas de uma "onda" decorativa (determinísticas: sem valores aleatórios
// que mudariam a cada render). Padrão orgânico estilo WhatsApp.
const WAVE_BARS = [
  0.35, 0.6, 0.45, 0.8, 0.55, 1, 0.7, 0.4, 0.65, 0.9, 0.5, 0.75, 0.3, 0.6, 0.85,
  0.45, 0.7, 0.55, 0.95, 0.4, 0.65, 0.5, 0.8, 0.35, 0.6, 0.75, 0.45, 0.55,
];

/** mm:ss — tempo do player. */
function fmt(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Player de áudio recebido, estilo WhatsApp: play/pause, "ondas" clicáveis para
 * seek e tempo decorrido/duração. Os bytes vêm do proxy autenticado do BFF via
 * `apiBlob` → object URL (um `<audio src>` cru não envia o Bearer). Busca preguiçosa
 * (só quando entra em tela), skeleton enquanto carrega, fallback discreto se falhar
 * e revogação do object URL no cleanup. Sem dependências pesadas.
 */
export function AudioPlayer({ jid, mediaId, isUser }: AudioPlayerProps) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  // Paleta conforme o lado da bolha (contraste sobre accent x bubble-them).
  const accent = isUser ? 'var(--accent-500)' : '#ffffff';
  const track = isUser
    ? 'color-mix(in srgb, var(--text-muted) 90%, transparent)'
    : 'rgba(255,255,255,0.42)';
  const timeColor = isUser ? 'var(--text-muted)' : 'rgba(255,255,255,0.7)';
  const btnBg = isUser ? 'var(--accent-500)' : 'rgba(255,255,255,0.92)';
  const btnIcon = isUser ? '#ffffff' : 'var(--accent-500)';

  // Baixa o áudio (autenticado) só quando visível; revoga no cleanup.
  useEffect(() => {
    if (!inView) return;
    let active = true;
    let created: string | null = null;
    apiBlob(
      `/api/v1/conversations/${encodeURIComponent(jid)}/media/${encodeURIComponent(mediaId)}`,
    )
      .then((blob) => {
        if (!active) return;
        created = URL.createObjectURL(blob);
        setUrl(created);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [jid, mediaId, inView]);

  // Pausa ao desmontar (evita áudio tocando após fechar a conversa).
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
    } else {
      void a.play().catch(() => setFailed(true));
    }
  };

  const onLoadedMetadata = () => {
    const a = audioRef.current;
    if (!a) return;
    // Blobs opus/webm às vezes reportam duração Infinity até um seek forçado.
    if (a.duration === Infinity || Number.isNaN(a.duration)) {
      const onSeeked = () => {
        a.currentTime = 0;
        setDuration(a.duration);
        a.removeEventListener('seeked', onSeeked);
      };
      a.addEventListener('seeked', onSeeked);
      a.currentTime = 1e101;
    } else {
      setDuration(a.duration);
    }
  };

  const seekTo = (ratio: number) => {
    const a = audioRef.current;
    if (!a || !isFinite(duration) || duration <= 0) return;
    const t = Math.min(Math.max(ratio, 0), 1) * duration;
    a.currentTime = t;
    setCurrent(t);
  };

  const progress = duration > 0 ? current / duration : 0;

  if (failed) {
    return (
      <div className="flex items-center gap-1.5 text-xs opacity-70 mb-1">
        <Headphones size={14} /> áudio indisponível
      </div>
    );
  }

  if (!url) {
    return (
      <div ref={ref} className="flex items-center gap-2.5 mb-1" style={{ minWidth: 180 }}>
        <div className="skeleton rounded-full" style={{ width: 34, height: 34 }} />
        <div className="skeleton rounded-full flex-1" style={{ height: 22 }} />
      </div>
    );
  }

  return (
    <div ref={ref} className="flex items-center gap-2.5 mb-1" style={{ minWidth: 180 }}>
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={() => setCurrent(audioRef.current?.currentTime ?? 0)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
        }}
        onError={() => setFailed(true)}
      />

      {/* Play / Pause */}
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Pausar áudio' : 'Reproduzir áudio'}
        className="flex-shrink-0 flex items-center justify-center rounded-full transition-transform duration-150 active:scale-90 focus-ring"
        style={{
          width: 34,
          height: 34,
          background: btnBg,
          color: btnIcon,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4), 0 1px 3px rgba(0,0,0,0.18)',
        }}
      >
        {playing ? (
          <Pause size={15} fill="currentColor" />
        ) : (
          <Play size={15} fill="currentColor" style={{ marginLeft: 1 }} />
        )}
      </button>

      <div className="flex flex-col gap-1 flex-1 min-w-0">
        {/* Ondas clicáveis (seek) */}
        <div
          className="relative flex items-center gap-[2px] h-6 cursor-pointer rounded focus-ring"
          role="slider"
          aria-label="Progresso do áudio"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration) || 0}
          aria-valuenow={Math.round(current)}
          tabIndex={0}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            seekTo((e.clientX - rect.left) / rect.width);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') seekTo(progress + 0.05);
            if (e.key === 'ArrowLeft') seekTo(progress - 0.05);
          }}
        >
          {WAVE_BARS.map((h, i) => {
            const played = i / WAVE_BARS.length < progress;
            return (
              <span
                key={i}
                className="flex-1 rounded-full transition-colors duration-150"
                style={{
                  height: `${Math.round(h * 100)}%`,
                  minHeight: 3,
                  background: played ? accent : track,
                }}
              />
            );
          })}
        </div>

        {/* Tempo decorrido / duração */}
        <div className="flex items-center justify-between text-[10px] tabular-nums" style={{ color: timeColor }}>
          <span>{fmt(current)}</span>
          <span>{fmt(duration)}</span>
        </div>
      </div>
    </div>
  );
}
