export type NexusEventType =
  | 'message.received'
  | 'ai.thinking'
  | 'ai.responded'
  | 'ai.toggled'
  | 'funnel.changed'
  | 'handoff.triggered'
  | 'payment.approved'
  | 'note.added'
  | 'lead.hot';

export interface NexusEvent {
  type: NexusEventType;
  instancia: string;
  jid: string;
  ts: number;
  payload: Record<string, unknown>;
}

export interface NexusEventEnvelope extends NexusEvent {
  eventId: string;
}
