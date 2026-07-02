import { IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SaveContactRequestDto {
  @ApiProperty({
    description: 'Nome do contato. Vazio remove o nome salvo (volta ao pushName).',
    maxLength: 80,
  })
  @IsString()
  @MaxLength(80)
  name!: string;
}
