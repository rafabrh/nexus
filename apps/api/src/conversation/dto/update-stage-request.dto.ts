import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateStageRequestDto {
  @ApiProperty({
    description: 'Novo stage do funil (S0-S6)',
    example: 'S3',
  })
  @IsString()
  @IsNotEmpty()
  stage!: string;
}
