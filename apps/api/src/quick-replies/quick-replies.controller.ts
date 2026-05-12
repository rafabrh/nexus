import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { QuickReply } from '@nexus/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IdempotencyInterceptor } from '../core/interceptors/idempotency.interceptor';
import { Tenant } from '../auth/decorators/tenant.decorator';
import { QuickRepliesService } from './quick-replies.service';
import { CreateQuickReplyDto } from './dto/create-quick-reply.dto';
import { UpdateQuickReplyDto } from './dto/update-quick-reply.dto';

@Controller('quick-replies')
@UseGuards(JwtAuthGuard)
@ApiTags('Quick Replies')
@ApiBearerAuth()
export class QuickRepliesController {
  constructor(private readonly service: QuickRepliesService) {}

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
    return this.service.create(instancia, dto.name, dto.content, dto.shortcut);
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
}
