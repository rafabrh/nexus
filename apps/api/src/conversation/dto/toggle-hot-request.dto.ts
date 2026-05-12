import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ToggleHotRequestDto {
  @ApiProperty({
    description: 'Marcar ou desmarcar como hot',
    example: true,
  })
  @IsBoolean()
  isHot!: boolean;
}
