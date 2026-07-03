import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendAudioRequestDto {
  @ApiProperty({ description: 'Áudio (nota de voz) em base64, sem o prefixo data:' })
  @IsString()
  @MaxLength(20_000_000) // teto ~14MB de binário — nota de voz real tem poucos KB
  audio!: string;

  @ApiPropertyOptional({ description: 'MIME type do áudio gravado (ex.: audio/webm)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  mimetype?: string;
}
