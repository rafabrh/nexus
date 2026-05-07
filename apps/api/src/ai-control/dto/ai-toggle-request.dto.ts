import { IsEnum, IsOptional, IsDateString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AiToggleRequestDto {
  @ApiProperty({
    description: 'Estado desejado da IA',
    enum: ['ON', 'OFF', 'OFF_UNTIL'],
  })
  @IsEnum(['ON', 'OFF', 'OFF_UNTIL'])
  state!: 'ON' | 'OFF' | 'OFF_UNTIL';

  @ApiPropertyOptional({
    description: 'Data/hora de expiracao (obrigatorio para OFF_UNTIL)',
  })
  @IsOptional()
  @IsDateString()
  expireAt?: string;

  @ApiPropertyOptional({
    description: 'ID de idempotencia do frontend',
  })
  @IsOptional()
  @IsUUID()
  clientRequestId?: string;
}
