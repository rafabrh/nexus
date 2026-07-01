import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  UseInterceptors,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type {
  ConversationListItem,
  ConversationDetail,
  Message,
} from '@nexus/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IdempotencyInterceptor } from '../core/interceptors/idempotency.interceptor';
import { Tenant } from '../auth/decorators/tenant.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ConversationService } from './conversation.service';
import { ConversationQueryDto } from './dto/conversation-query.dto';
import { AddNoteRequestDto } from './dto/add-note-request.dto';
import { AddTagRequestDto } from './dto/add-tag-request.dto';
import { SendMessageRequestDto } from './dto/send-message-request.dto';
import { UpdateStageRequestDto } from './dto/update-stage-request.dto';
import { ToggleHotRequestDto } from './dto/toggle-hot-request.dto';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
@ApiTags('Conversations')
@ApiBearerAuth()
export class ConversationController {
  constructor(private readonly service: ConversationService) {}

  @Get()
  @ApiOperation({ summary: 'Lista conversas do tenant' })
  async list(
    @Tenant() instancia: string,
    @Query() query: ConversationQueryDto,
  ): Promise<ConversationListItem[]> {
    return this.service.listConversations(instancia, {
      stage: query.stage,
      search: query.search,
      aiState: query.aiState,
    });
  }

  @Get(':jid')
  @ApiOperation({ summary: 'Detalhe de uma conversa' })
  async detail(
    @Tenant() instancia: string,
    @Param('jid') jid: string,
  ): Promise<ConversationDetail> {
    return this.service.getConversationDetail(instancia, jid);
  }

  @Get(':jid/messages')
  @ApiOperation({ summary: 'Historico de mensagens' })
  async messages(
    @Tenant() instancia: string,
    @Param('jid') jid: string,
    @Query('limit') limit?: number,
  ): Promise<Message[]> {
    return this.service.getMessages(instancia, jid, limit ?? 50);
  }

  @Post(':jid/notes')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Adicionar nota a conversa' })
  async addNote(
    @Tenant() instancia: string,
    @Param('jid') jid: string,
    @Body() dto: AddNoteRequestDto,
    @CurrentUser('sub') userEmail: string,
  ) {
    return this.service.addNote(instancia, jid, dto.text, userEmail);
  }

  @Delete(':jid/notes/:index')
  @ApiOperation({ summary: 'Remover nota por indice' })
  async removeNote(
    @Tenant() instancia: string,
    @Param('jid') jid: string,
    @Param('index', ParseIntPipe) index: number,
  ) {
    return this.service.removeNote(instancia, jid, index);
  }

  @Post(':jid/tags')
  @ApiOperation({ summary: 'Adicionar tag a conversa' })
  async addTag(
    @Tenant() instancia: string,
    @Param('jid') jid: string,
    @Body() dto: AddTagRequestDto,
  ) {
    return this.service.addTag(instancia, jid, dto.tag);
  }

  @Delete(':jid/tags/:tag')
  @ApiOperation({ summary: 'Remover tag da conversa' })
  async removeTag(
    @Tenant() instancia: string,
    @Param('jid') jid: string,
    @Param('tag') tag: string,
  ) {
    return this.service.removeTag(instancia, jid, tag);
  }

  @Post(':jid/send')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Enviar mensagem via Evolution API' })
  async sendMessage(
    @Tenant() instancia: string,
    @Param('jid') jid: string,
    @Body() dto: SendMessageRequestDto,
  ) {
    return this.service.sendMessage(instancia, jid, dto.text);
  }

  @Post(':jid/stage')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Atualizar stage do funil' })
  async updateStage(
    @Tenant() instancia: string,
    @Param('jid') jid: string,
    @Body() dto: UpdateStageRequestDto,
  ) {
    return this.service.updateStage(instancia, jid, dto.stage);
  }

  @Post(':jid/hot')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Toggle manual isHot flag' })
  async toggleHot(
    @Tenant() instancia: string,
    @Param('jid') jid: string,
    @Body() dto: ToggleHotRequestDto,
  ) {
    return this.service.toggleHot(instancia, jid, dto.isHot);
  }

  @Post(':jid/reset')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Resetar estado do lead (controle humano + flags transitorias)' })
  async resetState(
    @Tenant() instancia: string,
    @Param('jid') jid: string,
  ) {
    return this.service.resetState(instancia, jid);
  }

  @Post(':jid/read')
  @ApiOperation({ summary: 'Marca a conversa como lida (zera o contador de nao-lidas)' })
  async markRead(
    @Tenant() instancia: string,
    @Param('jid') jid: string,
  ) {
    return this.service.markRead(instancia, jid);
  }
}
