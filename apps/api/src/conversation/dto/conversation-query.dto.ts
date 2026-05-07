import { IsOptional, IsString, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import type { AiState, FunnelStageKey } from '@nexus/shared';

export class ConversationQueryDto {
  @ApiPropertyOptional({ description: 'Filtrar por etapa do funil (S0-S6)' })
  @IsOptional()
  @IsString()
  stage?: FunnelStageKey;

  @ApiPropertyOptional({ description: 'Buscar por nome ou JID' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filtrar por estado da IA', enum: ['ON', 'OFF', 'OFF_UNTIL'] })
  @IsOptional()
  @IsEnum(['ON', 'OFF', 'OFF_UNTIL'])
  aiState?: AiState;
}
