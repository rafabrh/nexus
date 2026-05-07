export type AiState = 'ON' | 'OFF' | 'OFF_UNTIL';

export interface AiControlResponse {
  state: AiState;
  until: string | null;
}

export interface AiToggleRequest {
  state: AiState;
  expireAt?: string;
  clientRequestId?: string;
}
