import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AuthResponseDto {
  @ApiProperty({
    description: 'Response message',
    example: 'Se o email estiver cadastrado, voce recebera o link.',
  })
  message!: string;

  @ApiPropertyOptional({
    description: 'Access token (only in JSON response mode)',
  })
  accessToken?: string;

  @ApiPropertyOptional({
    description: 'Refresh token (only in JSON response mode)',
  })
  refreshToken?: string;
}
