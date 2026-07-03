import { IsString, MinLength, MaxLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendMessageRequestDto {
  @ApiProperty({ description: 'Texto da mensagem', minLength: 1, maxLength: 4096 })
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  text!: string;

  @ApiPropertyOptional({ description: 'Id da mensagem citada para responder/quote' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  quotedId?: string;
}
