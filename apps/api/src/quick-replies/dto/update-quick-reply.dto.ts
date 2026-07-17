import {
  IsString,
  IsOptional,
  MaxLength,
  IsIn,
  IsInt,
  Min,
  Matches,
  ValidateNested,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { MediaRefDto } from './create-quick-reply.dto';

export class UpdateQuickReplyDto {
  @ApiPropertyOptional({ description: 'Nome do template', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ description: 'Conteudo da mensagem', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  content?: string;

  @ApiPropertyOptional({ description: 'Atalho para acesso rapido', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  shortcut?: string;

  @ApiPropertyOptional({
    description: 'Referencia de midia. null remove a midia existente. Omitir nao altera.',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((o) => o.media !== null)
  @ValidateNested()
  @Type(() => MediaRefDto)
  media?: MediaRefDto | null;
}

export { MediaRefDto };
