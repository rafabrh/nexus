import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Reminder, ReminderStatus } from '@nexus/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IdempotencyInterceptor } from '../core/interceptors/idempotency.interceptor';
import { Tenant } from '../auth/decorators/tenant.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RemindersService } from './reminders.service';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { UpdateReminderDto } from './dto/update-reminder.dto';

@Controller('reminders')
@UseGuards(JwtAuthGuard)
@ApiTags('Reminders')
@ApiBearerAuth()
export class RemindersController {
  constructor(private readonly service: RemindersService) {}

  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Criar lembrete' })
  async create(
    @Tenant() instancia: string,
    @Body() dto: CreateReminderDto,
    @CurrentUser('sub') userEmail: string,
  ): Promise<Reminder> {
    return this.service.create(instancia, dto.jid, dto.text, dto.triggerAt, userEmail);
  }

  @Get()
  @ApiOperation({ summary: 'Listar lembretes (filtro por status)' })
  async list(
    @Tenant() instancia: string,
    @Query('status') status?: ReminderStatus,
  ): Promise<Reminder[]> {
    return this.service.list(instancia, status);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar/dismiss lembrete' })
  async update(
    @Tenant() instancia: string,
    @Param('id') id: string,
    @Body() dto: UpdateReminderDto,
  ): Promise<Reminder> {
    return this.service.update(instancia, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deletar lembrete' })
  async remove(
    @Tenant() instancia: string,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    await this.service.remove(instancia, id);
    return { message: 'Lembrete removido' };
  }
}
