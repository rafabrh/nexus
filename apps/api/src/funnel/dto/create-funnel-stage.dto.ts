import { IsString, IsNotEmpty, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateFunnelStageDto {
  @ApiProperty({ description: 'Rótulo exibido da coluna', example: 'Proposta enviada' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  label!: string;

  @ApiProperty({ description: 'Cor da coluna (hex)', example: '#3B82F6' })
  @IsString()
  @IsNotEmpty()
  // Hex de 3 ou 6 dígitos. Confina a cor a um valor renderizável e barra
  // injeção de string arbitrária no atributo de estilo do front.
  @Matches(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, {
    message: 'color deve ser um hex válido (ex.: #3B82F6)',
  })
  color!: string;
}
