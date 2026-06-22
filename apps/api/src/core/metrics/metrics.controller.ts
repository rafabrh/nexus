import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiProduces } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { FastifyReply } from 'fastify';
import { MetricsService } from './metrics.service';
import { MetricsAuthGuard } from './metrics-auth.guard';

@Controller('metrics')
@ApiTags('Metrics')
@SkipThrottle()
@UseGuards(MetricsAuthGuard)
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @ApiOperation({ summary: 'Prometheus metrics endpoint' })
  @ApiProduces('text/plain')
  async getMetrics(@Res() reply: FastifyReply): Promise<void> {
    const metricsData = await this.metrics.getMetrics();
    reply
      .header('content-type', this.metrics.getContentType())
      .send(metricsData);
  }
}
