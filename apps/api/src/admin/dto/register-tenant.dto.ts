import { IsString, IsNotEmpty, IsEmail, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterTenantDto {
  @ApiProperty({
    description:
      'Nome da instancia. Apenas letras, numeros e underscore. NAO use hifen: ' +
      "o sistema usa '-' como separador em chathistory:{inst}-{phone} e ':' em " +
      'chat:{inst}:{jid}; um hifen no nome quebra o roteamento realtime e vaza ' +
      'eventos entre tenants.',
    example: 'lojamaria',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message:
      "instancia deve conter apenas letras, numeros e underscore (sem '-' nem ':')",
  })
  instancia!: string;

  @ApiProperty({
    description: 'Email do administrador do tenant',
    example: 'admin@example.com',
  })
  @IsEmail({}, { message: 'adminEmail deve ser um email valido' })
  adminEmail!: string;
}
