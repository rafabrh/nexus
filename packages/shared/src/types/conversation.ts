import type { AiState } from './ai-control-state';
import type { FunnelStageKey } from './funnel-stage';

export interface ConversationListItem {
  jid: string;
  contactName: string;
  phoneDisplay: string;
  aiState: AiState;
  aiOffUntil: string | null;
  stage: FunnelStageKey;
  stageLabel: string;
  stageColor: string;
  stageProgress: number;
  paymentStatus: string | null;
  optout: boolean;
  tags: string[];
  lastMessagePreview: string;
  lastActivity: string;
  isHot: boolean;
}

export interface ConversationDetail extends ConversationListItem {
  notes: string[];
  messageCount: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  mediaType: 'text' | 'audio' | 'image' | 'document';
  ts: string | null;
}
