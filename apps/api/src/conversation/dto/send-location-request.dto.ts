import { IsNumber, IsString, IsOptional, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendLocationRequestDto {
  @ApiProperty({ description: 'Latitude do pino (graus decimais).' })
  @Type(() => Number)
  @IsNumber()
  latitude!: number;

  @ApiProperty({ description: 'Longitude do pino (graus decimais).' })
  @Type(() => Number)
  @IsNumber()
  longitude!: number;

  @ApiPropertyOptional({ description: 'Rótulo do local (ex.: nome do estabelecimento).' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ description: 'Endereço exibido sob o mapa.' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;
}
