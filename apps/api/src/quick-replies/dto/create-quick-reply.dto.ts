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
}
