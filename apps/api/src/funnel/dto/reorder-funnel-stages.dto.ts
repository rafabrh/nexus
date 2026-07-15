import { IsArray, IsString, ArrayNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReorderFunnelStagesDto {
  @ApiProperty({
    description: 'IDs dos estágios na nova ordem desejada',
    example: ['id-a', 'id-b', 'id-c'],
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids!: string[];
}
