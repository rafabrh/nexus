import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MinLength,
  MaxLength,
  IsIn,
  IsInt,
  Min,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MediaRefDto {
  @ApiProperty({ description: 'UUID do arquivo ja gravado no storage', example: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' })
  @IsString()
  @Matches(/^[0-9a-f-]{36}$/)
  id!: string;

  @ApiProperty({ description: 'Tipo de midia', enum: ['image', 'video'] })
  @IsIn(['image', 'video'])
  type!: 'image' | 'video';

  @ApiProperty({ description: 'Mimetype do arquivo', example: 'image/jpeg' })
  @IsString()
  @MaxLength(120)
  mimetype!: string;

  @ApiProperty({ description: 'Nome original do arquivo', example: 'photo.jpg' })
  @IsString()
  @MaxLength(255)
  filename!: string;

  @ApiProperty({ description: 'Tamanho em bytes' })
  @IsInt()
  @Min(0)
  size!: number;
}

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

  @ApiPropertyOptional({ description: 'Referencia de midia opcional (imagem ou video ja gravado no storage)' })
  @IsOptional()
  @ValidateNested()
  @Type(() => MediaRefDto)
  media?: MediaRefDto;
}
