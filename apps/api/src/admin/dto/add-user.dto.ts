import { IsEmail, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddUserDto {
  @ApiProperty({ description: 'Email do usuario', example: 'user@example.com' })
  @IsEmail({}, { message: 'email deve ser um email valido' })
  email!: string;

  @ApiProperty({ description: 'Role do usuario', enum: ['admin', 'operator'], example: 'operator' })
  @IsIn(['admin', 'operator'], { message: 'role deve ser admin ou operator' })
  role!: 'admin' | 'operator';
}
