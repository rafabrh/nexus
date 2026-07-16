import { IsString, IsNotEmpty, IsOptional, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateQuickReplyDto {
  @ApiProperty({ description: 'Nome do template', example: 'Saudacao' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ description: 'Conteudo da mensagem', example: 'Ola! Como posso ajudar?' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content!: string;

  @ApiPropertyOptional({ description: 'Atalho para acesso rapido', example: '/ola' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  shortcut?: string;

  @ApiPropertyOptional({ description: 'Imagem do template em base64 (sem prefixo data:).' })
  @IsOptional()
  @IsString()
  // ~1 MB de binário → ~1,4 M de caracteres base64. Trava para não inchar a linha.
  @MaxLength(1_400_000)
  image?: string;

  @ApiPropertyOptional({ description: 'Mimetype da imagem', example: 'image/jpeg' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  imageMimetype?: string;
}
