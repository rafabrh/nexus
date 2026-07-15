import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendContactRequestDto {
  @ApiProperty({ description: 'Nome completo exibido no cartão de contato.' })
  @IsString()
  @MaxLength(120)
  fullName!: string;

  @ApiProperty({ description: 'Telefone do contato (com DDI/DDD). Ex.: 5511999999999' })
  @IsString()
  @MaxLength(30)
  phoneNumber!: string;

  @ApiPropertyOptional({ description: 'Organização/empresa do contato.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  organization?: string;

  @ApiPropertyOptional({ description: 'E-mail do contato.' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;
}
