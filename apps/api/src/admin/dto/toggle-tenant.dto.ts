import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ToggleTenantDto {
  @ApiProperty({ description: 'Ativar ou desativar o tenant', example: true })
  @IsBoolean()
  active!: boolean;
}
