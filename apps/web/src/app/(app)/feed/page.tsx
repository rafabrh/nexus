'use client';

import { Radio } from 'lucide-react';
import { FeedEntry } from '@/components/feed/feed-entry';
import { useRealtimeStore } from '@/stores/realtime.store';
import { cn } from '@/lib/utils';

export default function FeedPage() {
  const events = useRealtimeStore((s) => s.events);
  const connected = useRealtimeStore((s) => s.connected);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Feed IA</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Eventos em tempo real do agente NEXUS
          </p>
        </div>
        <div className="flex items-center gap-2">
          {connected && <span className="live-dot" />}
          <span
            className={cn(
              'text-xs font-medium',
              connected ? 'text-error' : 'text-text-muted',
            )}
          >
            {connected ? 'AO VIVO' : 'DESCONECTADO'}
          </span>
        </div>
      </div>

      {/* Events */}
      {events.length === 0 ? (
        <div className="bg-bg-surface border border-border rounded-card p-12 text-center">
          <Radio
            size={32}
            className="text-text-muted mx-auto mb-3"
          />
          <h3 className="text-md font-medium text-text-secondary mb-1">
            Aguardando eventos
          </h3>
          <p className="text-sm text-text-muted max-w-sm mx-auto">
            Eventos do agente IA aparecerrao aqui em tempo real conforme as
            conversas acontecem.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((event) => (
            <FeedEntry key={event.eventId} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}
