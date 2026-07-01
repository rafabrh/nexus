import {
  Controller,
  Post,
  Body,
  Headers,
  Query,
  HttpCode,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { timingSafeEqual } from 'crypto';
import { WebhookService } from './webhook.service';
import { Public } from '../auth/decorators/public.decorator';

@Controller('webhook')
@ApiTags('Webhooks')
@Public()
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
    @Headers('apikey') apiKeyHeader: string | undefined,
    @Query('apikey') apiKeyQuery: string | undefined,
    @Body() payload: Record<string, unknown>,
  ): Promise<void> {
    const expectedKey = this.config.get<string>('EVOLUTION_API_KEY');

    if (!expectedKey) {
      this.logger.error('webhook.rejected: EVOLUTION_API_KEY not configured');
      throw new UnauthorizedException('Webhook not configured');
    }

    // A Evolution NAO envia o header `apikey` nos webhooks de saida — por isso
    // todo webhook estava sendo rejeitado com 401. Aceitamos a chave tambem via
    // query (`?apikey=...`), assim a URL do webhook se auto-autentica. O header
    // continua valendo (retrocompat, caso alguma versao da Evolution o envie).
    const provided = apiKeyHeader ?? apiKeyQuery;
    if (!this.constantTimeEqual(provided, expectedKey)) {
      this.logger.warn('webhook.invalid-apikey from Evolution API');
      throw new UnauthorizedException('Invalid API key');
    }

    await this.service.processEvolutionEvent(payload);
  }

  /** Constant-time comparison to avoid leaking the key via timing. */
  private constantTimeEqual(provided: string | undefined, expected: string): boolean {
    if (!provided) return false;
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
