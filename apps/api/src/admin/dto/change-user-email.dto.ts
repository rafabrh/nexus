import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangeUserEmailDto {
  @ApiProperty({
    description: 'Novo e-mail de acesso (o antigo, no path, perde o acesso)',
    example: 'novo@cliente.com',
  })
  @IsEmail({}, { message: 'newEmail deve ser um email valido' })
  newEmail!: string;
}
