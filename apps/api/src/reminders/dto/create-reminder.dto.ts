import { IsString, IsNotEmpty, IsNumber, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateReminderDto {
  @ApiProperty({ description: 'JID do contato', example: '5511999999999@s.whatsapp.net' })
  @IsString()
  @IsNotEmpty()
  jid!: string;

  @ApiProperty({ description: 'Texto do lembrete', minLength: 1, maxLength: 500 })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  text!: string;

  @ApiProperty({ description: 'Timestamp (ms) para disparo do lembrete', example: 1715500000000 })
  @IsNumber()
  triggerAt!: number;
}
