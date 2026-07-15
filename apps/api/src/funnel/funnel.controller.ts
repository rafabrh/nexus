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
import type { FunnelStageDto } from '@nexus/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IdempotencyInterceptor } from '../core/interceptors/idempotency.interceptor';
import { Tenant } from '../auth/decorators/tenant.decorator';
import { FunnelStagesService } from './funnel-stages.service';
import { CreateFunnelStageDto } from './dto/create-funnel-stage.dto';
import { UpdateFunnelStageDto } from './dto/update-funnel-stage.dto';
import { ReorderFunnelStagesDto } from './dto/reorder-funnel-stages.dto';

@Controller('funnel')
@UseGuards(JwtAuthGuard)
@ApiTags('Funnel')
@ApiBearerAuth()
export class FunnelController {
  constructor(private readonly service: FunnelStagesService) {}

  @Get('stages')
  @ApiOperation({ summary: 'Listar estágios do funil do tenant (ordenados)' })
  async list(@Tenant() instancia: string): Promise<FunnelStageDto[]> {
    return this.service.list(instancia);
  }

  @Post('stages')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Criar estágio (coluna) do funil' })
  async create(
    @Tenant() instancia: string,
    @Body() dto: CreateFunnelStageDto,
  ): Promise<FunnelStageDto> {
    return this.service.create(instancia, { label: dto.label, color: dto.color });
  }

  // reorder ANTES de ':id' — senão o Nest casaria "reorder" como um :id.
  @Post('stages/reorder')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Reordenar estágios em lote (transacional)' })
  async reorder(
    @Tenant() instancia: string,
    @Body() dto: ReorderFunnelStagesDto,
  ): Promise<FunnelStageDto[]> {
    return this.service.reorder(instancia, dto.ids);
  }

  @Patch('stages/:id')
  @ApiOperation({ summary: 'Renomear / recolorir / reordenar um estágio' })
  async update(
    @Tenant() instancia: string,
    @Param('id') id: string,
    @Body() dto: UpdateFunnelStageDto,
  ): Promise<FunnelStageDto> {
    return this.service.update(instancia, id, dto);
  }

  @Delete('stages/:id')
  @ApiOperation({
    summary: 'Excluir estágio (409 + count se houver conversas nele)',
  })
  async remove(
    @Tenant() instancia: string,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    await this.service.remove(instancia, id);
    return { message: 'Estágio removido' };
  }
}
