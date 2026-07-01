import { IsUrl } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class InstanceConfigDto {
  @ApiProperty({
    description:
      'URL do webhook do fluxo N8N deste cliente. O BFF reencaminha o payload ' +
      'cru da Evolution para ela — sem ela, a instancia sobe sem IA.',
    example: 'https://n8n-evolution-api.b8ul3d.easypanel.host/webhook/clientewpp',
  })
  // require_tld:false aceita hosts internos (ex.: docker/easypanel sem TLD).
  @IsUrl({ require_tld: false })
  n8nWebhookUrl!: string;
}
