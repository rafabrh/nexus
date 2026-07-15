import { IsString, IsOptional, IsInt, Min, MaxLength, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateFunnelStageDto {
  @ApiPropertyOptional({ description: 'Novo rótulo da coluna', maxLength: 60 })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  label?: string;

  @ApiPropertyOptional({ description: 'Nova cor da coluna (hex)', example: '#10B981' })
  @IsOptional()
  @IsString()
  @Matches(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, {
    message: 'color deve ser um hex válido (ex.: #10B981)',
  })
  color?: string;

  @ApiPropertyOptional({ description: 'Nova posição (0-based)', example: 2 })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}
