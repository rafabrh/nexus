import { IsString, IsNotEmpty, IsEmail, Matches, IsUrl } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** Adotar uma instância que já existe na Evolution (ex.: Shkgroup) no painel. */
export class AdoptInstanceDto {
  @ApiProperty({
    description:
      'Nome EXATO da instancia existente na Evolution. Apenas letras, numeros e ' +
      "underscore (sem '-' nem ':') — igual ao usado no N8N e na Evolution.",
    example: 'Shkgroup',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: "instancia deve conter apenas letras, numeros e underscore (sem '-' nem ':')",
  })
  instancia!: string;

  @ApiProperty({ description: 'Email do administrador do tenant', example: 'dono@cliente.com' })
  @IsEmail({}, { message: 'adminEmail deve ser um email valido' })
  adminEmail!: string;

  @ApiProperty({
    description: 'URL do webhook do fluxo N8N deste cliente.',
    example: 'https://n8n-evolution-api.b8ul3d.easypanel.host/webhook/shkgroupwpp',
  })
  @IsUrl({ require_tld: false })
  n8nWebhookUrl!: string;
}
