import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Inject,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  BadRequestException,
  NotFoundException,
  UnsupportedMediaTypeException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { QuickReply } from '@nexus/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { IdempotencyInterceptor } from '../core/interceptors/idempotency.interceptor';
import { Tenant } from '../auth/decorators/tenant.decorator';
import { QuickRepliesService } from './quick-replies.service';
import { CreateQuickReplyDto } from './dto/create-quick-reply.dto';
import { UpdateQuickReplyDto } from './dto/update-quick-reply.dto';
import { MEDIA_STORAGE, type MediaStorage } from '../media/media-storage.interface';

@Controller('quick-replies')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('Quick Replies')
@ApiBearerAuth()
export class QuickRepliesController {
  constructor(
    private readonly service: QuickRepliesService,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar quick replies do tenant' })
  async list(@Tenant() instancia: string): Promise<QuickReply[]> {
    return this.service.list(instancia);
  }

  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Criar quick reply' })
  async create(
    @Tenant() instancia: string,
    @Body() dto: CreateQuickReplyDto,
  ): Promise<QuickReply> {
    return this.service.create(
      instancia,
      dto.name,
      dto.content,
      dto.shortcut,
      dto.media,
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar quick reply' })
  async update(
    @Tenant() instancia: string,
    @Param('id') id: string,
    @Body() dto: UpdateQuickReplyDto,
  ): Promise<QuickReply> {
    return this.service.update(instancia, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deletar quick reply' })
  async remove(
    @Tenant() instancia: string,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    await this.service.remove(instancia, id);
    return { message: 'Quick reply removido' };
  }

  @Post('media')
  @Roles('admin')
  @ApiOperation({ summary: 'Upload de mídia para quick reply (multipart)' })
  async uploadMedia(@Tenant() instancia: string, @Req() req: FastifyRequest) {
    const file = await (req as any).file();
    if (!file) throw new BadRequestException('arquivo ausente');
    const mimetype: string = file.mimetype ?? '';
    const type = mimetype.startsWith('image/')
      ? 'image'
      : mimetype.startsWith('video/')
        ? 'video'
        : null;
    if (!type) throw new UnsupportedMediaTypeException('apenas imagem ou vídeo');
    const stored = await this.storage.put(instancia, file.file, { mimetype, filename: file.filename });
    if ((file.file as any).truncated) {
      await this.storage.delete(instancia, stored.id);
      throw new PayloadTooLargeException('acima do teto');
    }
    return { mediaId: stored.id, mediaType: type, mimetype, filename: stored.filename, size: stored.size };
  }

  @Get('media/:mediaId')
  @ApiOperation({ summary: 'Preview de mídia de quick reply (JWT)' })
  async serveMedia(
    @Tenant() instancia: string,
    @Param('mediaId') mediaId: string,
    @Res() res: FastifyReply,
  ) {
    const row = await this.service.findByMediaId(instancia, mediaId);
    if (!row) throw new NotFoundException();
    res.header('Content-Type', row.mediaMimetype ?? 'application/octet-stream');
    res.header('Cache-Control', 'private, max-age=300');
    return res.send(this.storage.createReadStream(instancia, mediaId));
  }
}
