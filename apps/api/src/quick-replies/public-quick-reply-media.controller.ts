import {
  Controller,
  Get,
  Inject,
  Param,
  Query,
  Res,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { Public } from '../auth/decorators/public.decorator';
import { MEDIA_STORAGE, type MediaStorage } from '../media/media-storage.interface';
import { verifyMedia } from '../media/media-signature.util';

@Public()
@Controller('public/qr-media')
@ApiTags('Public QR Media')
export class PublicQuickReplyMediaController {
  constructor(
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
    private readonly config: ConfigService,
  ) {}

  @Get(':mediaId')
  @ApiOperation({ summary: 'Serve mídia de quick reply via URL assinada (sem auth JWT)' })
  async serve(
    @Param('mediaId') mediaId: string,
    @Query('inst') inst: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Res() res: FastifyReply,
  ) {
    const secret = this.config.getOrThrow<string>('MEDIA_SIGN_SECRET');
    if (!verifyMedia(inst, mediaId, Number(exp), sig, secret)) {
      throw new ForbiddenException();
    }
    if (!(await this.storage.exists(inst, mediaId))) {
      throw new NotFoundException();
    }
    res.header('Cache-Control', 'no-store');
    return res.send(this.storage.createReadStream(inst, mediaId));
  }
}
