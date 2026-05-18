import { IsString, IsNotEmpty, IsEmail, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterTenantDto {
  @ApiProperty({
    description: 'Nome da instancia (alfanumerico, hifens, underscores)',
    example: 'nexus-demo',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: 'instancia deve conter apenas letras, numeros, hifens e underscores',
  })
  instancia!: string;

  @ApiProperty({
    description: 'Email do administrador do tenant',
    example: 'admin@example.com',
  })
  @IsEmail({}, { message: 'adminEmail deve ser um email valido' })
  adminEmail!: string;
}
