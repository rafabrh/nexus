'use client';

import { motion } from 'framer-motion';
import { Radio } from 'lucide-react';
import { FeedEntry } from '@/components/feed/feed-entry';
import { useRealtimeStore } from '@/stores/realtime.store';
import { LenisProvider } from '@/providers/lenis-provider';
import { pageTransition, pageTransitionConfig } from '@/lib/motion-variants';

export default function FeedPage() {
  const events = useRealtimeStore((s) => s.events);
  const connected = useRealtimeStore((s) => s.connected);

  return (
    <LenisProvider>
      <motion.div
        className="p-6 max-w-3xl mx-auto"
        variants={pageTransition}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={pageTransitionConfig}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-text-primary">Feed IA</h1>
            <p className="text-sm text-text-secondary mt-0.5">
              Eventos em tempo real do agente NEXUS
            </p>
          </div>

          {/* Live indicator pill */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 12px',
              borderRadius: '9999px',
              background: connected
                ? 'color-mix(in srgb, var(--error) 8%, transparent)'
                : 'color-mix(in srgb, var(--separator) 20%, transparent)',
              border: connected
                ? '1px solid color-mix(in srgb, var(--error) 20%, transparent)'
                : '1px solid var(--separator)',
            }}
          >
            {connected && <span className="live-dot flex-shrink-0" />}
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.05em',
                color: connected ? 'var(--error)' : 'var(--color-text-muted)',
              }}
            >
              {connected ? 'AO VIVO' : 'DESCONECTADO'}
            </span>
          </div>
        </div>

        {/* Events */}
        {events.length === 0 ? (
          <div
            className="glass"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--separator)',
              borderRadius: 'var(--radius-card)',
              padding: '48px 16px',
              textAlign: 'center',
            }}
          >
            <Radio size={32} className="text-text-muted mx-auto mb-3" />
            <h3 className="text-md font-medium text-text-secondary mb-1">Aguardando eventos</h3>
            <p className="text-sm text-text-muted max-w-sm mx-auto">
              Eventos do agente IA aparecerão aqui em tempo real conforme as conversas acontecem.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <FeedEntry key={event.eventId} event={event} />
            ))}
          </div>
        )}
      </motion.div>
    </LenisProvider>
  );
}
