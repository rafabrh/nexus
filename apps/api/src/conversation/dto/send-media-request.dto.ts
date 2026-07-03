import { IsString, IsIn, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendMediaRequestDto {
  @ApiProperty({ enum: ['image', 'video', 'document'] })
  @IsString()
  @IsIn(['image', 'video', 'document'])
  mediatype!: 'image' | 'video' | 'document';

  @ApiProperty({ description: 'Conteúdo em base64 (sem o prefixo data:).' })
  @IsString()
  media!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  caption?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  mimetype?: string;
}
