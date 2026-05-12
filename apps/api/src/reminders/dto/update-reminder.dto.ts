import { IsOptional, IsString, IsNumber, IsEnum, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import type { ReminderStatus } from '@nexus/shared';

export class UpdateReminderDto {
  @ApiPropertyOptional({ description: 'Novo texto do lembrete', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  text?: string;

  @ApiPropertyOptional({ description: 'Novo timestamp de disparo (ms)' })
  @IsOptional()
  @IsNumber()
  triggerAt?: number;

  @ApiPropertyOptional({
    description: 'Novo status do lembrete',
    enum: ['pending', 'triggered', 'dismissed'],
  })
  @IsOptional()
  @IsEnum(['pending', 'triggered', 'dismissed'])
  status?: ReminderStatus;
}
