import type { FunnelStageKey } from './funnel-stage';

export interface Lead {
  leadId: string;
  name: string;
  phone: string;
  instancia: string;
  stage: FunnelStageKey;
  status: 'ativo' | 'inativo' | 'pago';
  origem: string;
  firstContact: string;
  lastContact: string;
  totalInteractions: number;
  valorPago: number;
  tags: string[];
  notes: string;
  handoffCount: number;
}
