import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const VALID_STAGES = ['S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6'] as const;

export class UpdateStageRequestDto {
  @ApiProperty({
    description: 'Novo stage do funil (S0-S6)',
    example: 'S3',
    enum: VALID_STAGES,
  })
  @IsIn(VALID_STAGES, { message: 'Stage deve ser S0, S1, S2, S3, S4, S5 ou S6' })
  stage!: string;
}
