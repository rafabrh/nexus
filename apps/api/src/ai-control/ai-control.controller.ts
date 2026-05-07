import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { AiControlResponse } from '@nexus/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IdempotencyInterceptor } from '../core/interceptors/idempotency.interceptor';
import { Tenant } from '../auth/decorators/tenant.decorator';
import { AiControlService } from './ai-control.service';
import { AiToggleRequestDto } from './dto/ai-toggle-request.dto';

@Controller('conversations/:jid/ai')
@UseGuards(JwtAuthGuard)
@ApiTags('AI Control')
@ApiBearerAuth()
export class AiControlController {
  constructor(private readonly service: AiControlService) {}

  @Get()
  @ApiOperation({ summary: 'Status atual da IA para esta conversa' })
  async getState(
    @Tenant() instancia: string,
    @Param('jid') jid: string,
  ): Promise<AiControlResponse> {
    return this.service.getState(instancia, jid);
  }

  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Toggle IA ON/OFF/OFF_UNTIL' })
  async toggle(
    @Tenant() instancia: string,
    @Param('jid') jid: string,
    @Body() dto: AiToggleRequestDto,
  ): Promise<AiControlResponse> {
    return this.service.toggle(instancia, jid, dto);
  }
}
