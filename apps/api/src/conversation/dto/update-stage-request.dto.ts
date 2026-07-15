import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateStageRequestDto {
  @ApiProperty({
    // O funil agora é dinâmico por-tenant: o `stage` é o `key` de um estágio de
    // `funnel_stages` daquele tenant (não mais o enum fixo S0..S6). A validação
    // de que o key REALMENTE existe para o tenant acontece em runtime no
    // ConversationService.updateStage (404/400), não como enum estático aqui.
    description: 'Key do estágio do funil (estágio do tenant; ex.: S3, proposta-enviada)',
    example: 'S3',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  stage!: string;
}
