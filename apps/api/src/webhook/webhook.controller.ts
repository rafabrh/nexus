import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { WebhookService } from './webhook.service';

@Controller('webhook')
@ApiTags('Webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly service: WebhookService,
    private readonly config: ConfigService,
  ) {}

  @Post('evolution')
  @HttpCode(200)
  @ApiOperation({ summary: 'Recebe eventos da Evolution API (webhook)' })
  async handleEvolution(
    @Headers('apikey') apiKey: string | undefined,
    @Body() payload: Record<string, unknown>,
  ): Promise<void> {
    const expectedKey = this.config.get<string>('EVOLUTION_API_KEY');

    if (!expectedKey) {
      this.logger.error('webhook.rejected: EVOLUTION_API_KEY not configured');
      throw new UnauthorizedException('Webhook not configured');
    }

    if (apiKey !== expectedKey) {
      this.logger.warn('webhook.invalid-apikey from Evolution API');
      throw new UnauthorizedException('Invalid API key');
    }

    await this.service.processEvolutionEvent(payload);
  }
}
