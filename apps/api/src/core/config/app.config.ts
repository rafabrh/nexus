import { plainToInstance, Type } from 'class-transformer';
import { IsString, IsNumber, IsOptional, Min, MinLength, ValidateIf, validateSync } from 'class-validator';

export class AppConfig {
  // ---- Redis ----
  @IsString()
  REDIS_URL!: string;

  @IsOptional()
  @IsString()
  REDIS_PASSWORD?: string;

  // ---- Postgres (sistema de registro) ----
  @IsString()
  DATABASE_URL!: string;

  // ---- JWT ----
  // HS256 requires a high-entropy secret of at least 256 bits (32 bytes).
  // A short/guessable secret makes every token forgeable.
  @IsString()
  @MinLength(32, { message: 'JWT_SECRET must be at least 32 characters (256-bit)' })
  JWT_SECRET!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(60000)
  JWT_EXPIRATION_MS: number = 900000;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(60000)
  JWT_REFRESH_EXPIRATION_MS: number = 604800000;

  // ---- CORS ----
  @IsOptional()
  @IsString()
  CORS_ALLOWED_ORIGINS: string = 'http://localhost:3000';

  // ---- Admin ----
  @IsOptional()
  @IsString()
  ADMIN_EMAIL: string = 'rafa@shkgroups.com';

  // ---- Dev seed (non-production safety net) ----
  // When SEED_INSTANCE is set AND there are no tenants, the API seeds a single
  // admin tenant on boot so local logins work against a fresh Postgres.
  // Ignored entirely when NODE_ENV=production. SEED_ADMIN_EMAIL falls back to
  // ADMIN_EMAIL when omitted.
  @IsOptional()
  @IsString()
  SEED_INSTANCE?: string;

  @IsOptional()
  @IsString()
  SEED_ADMIN_EMAIL?: string;

  // ---- Evolution API ----
  @IsOptional()
  @IsString()
  EVOLUTION_API_URL: string = 'https://n8n-evolution-api.b8ul3d.easypanel.host';

  @IsOptional()
  @IsString()
  EVOLUTION_API_KEY?: string;

  // ---- Resend (email) ----
  @IsOptional()
  @IsString()
  RESEND_API_KEY?: string;

  @IsOptional()
  @IsString()
  RESEND_FROM: string = 'noreply@shkgroups.com';

  // ---- SMTP (email oficial; tem precedencia sobre Resend quando configurado) ----
  @IsOptional()
  @IsString()
  SMTP_HOST?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  SMTP_PORT?: number;

  @IsOptional()
  @IsString()
  SMTP_USER?: string;

  @IsOptional()
  @IsString()
  SMTP_PASS?: string;

  @IsOptional()
  @IsString()
  SMTP_SECURE?: string;

  // Remetente unificado (cai para RESEND_FROM / SMTP_USER quando ausente).
  @IsOptional()
  @IsString()
  MAIL_FROM?: string;

  @IsOptional()
  @IsString()
  MAGIC_LINK_BASE_URL: string = 'http://localhost:3000/auth/callback';

  // ---- App ----
  @IsOptional()
  @IsString()
  APP_BASE_URL: string = 'http://localhost:4000';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  PORT: number = 4000;

  @IsOptional()
  @IsString()
  LOG_LEVEL: string = 'info';

  // ---- Metrics scrape auth ----
  // Bearer token required to read /metrics. In production, if unset, /metrics is
  // denied (must be configured); outside production it stays open for dev tools.
  @IsOptional()
  @IsString()
  METRICS_TOKEN?: string;

  // ---- Google Sheets ----
  @IsOptional()
  @IsString()
  SHEETS_DOCUMENT_ID?: string;

  @IsOptional()
  @IsString()
  GOOGLE_SERVICE_ACCOUNT_JSON?: string;

  // ---- Media (quick-reply attachments) ----
  // Diretório raiz onde imagens/vídeos de respostas rápidas são armazenados em disco.
  @IsOptional()
  @IsString()
  MEDIA_ROOT: string = '/data/media';

  // Tamanho máximo (bytes) aceito por upload de mídia de resposta rápida (default 64 MB).
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  QR_MEDIA_MAX_BYTES: number = 67108864;

  // Segredo para assinar URLs de mídia.
  // Em produção: obrigatório com pelo menos 32 caracteres (256 bits mínimos).
  // Fora de produção: opcional (dev/test não precisam configurar).
  @ValidateIf((o) => process.env.NODE_ENV === 'production')
  @IsString({ message: 'MEDIA_SIGN_SECRET deve ser uma string em producao' })
  @MinLength(32, { message: 'MEDIA_SIGN_SECRET deve ter ao menos 32 caracteres em producao (segredo curto e fraco)' })
  MEDIA_SIGN_SECRET?: string;

  // ---- Rate limit ----
  // E-mails ISENTOS do rate limit de login (magic-link), ADICIONAIS aos admins
  // do sistema já embutidos no código (core/throttler/rate-limit-exempt.ts).
  // CSV, opcional — a lista base já cobre os donos; use para estender sem
  // redeploy. Lido diretamente do env pelo TenantThrottlerGuard.
  @IsOptional()
  @IsString()
  RATE_LIMIT_EXEMPT_EMAILS?: string;

  // ---- Chat-history archiving (tiering do Redis) ----
  // Número de mensagens a manter quentes no Redis (cauda do chathistory).
  // Quando a lista ultrapassa esse valor o LTRIM atômico (Lua) descarta a cabeça
  // — que já foi arquivada no Postgres — para manter o Redis enxuto.
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  CHATHISTORY_HOT_CAP: number = 300;

  // Habilita o write-behind da cauda para o Postgres (archive).
  // 'true' | 'false' — default 'false' (desligado; ligar após o backfill rodar).
  @IsOptional()
  @IsString()
  CHATHISTORY_ARCHIVE_ENABLED: string = 'false';

  // Habilita o LTRIM atômico após o archive (reduz tamanho do Redis).
  // Só tem efeito quando CHATHISTORY_ARCHIVE_ENABLED=true.
  // 'true' | 'false' — default 'false' (ligar na última fase do rollout).
  @IsOptional()
  @IsString()
  CHATHISTORY_LTRIM_ENABLED: string = 'false';

  // Janela de coalescing do archive write-behind (segundos).
  // Dentro da janela, apenas o primeiro rpush de uma conversa dispara o archive;
  // os seguintes são ignorados (o SET NX EX atua como throttle por conversa).
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  CHATHISTORY_ARCHIVE_THROTTLE_SEC: number = 5;

  // ---- RabbitMQ consumer (Etapa 2 — desacoplamento) ----
  // URL AMQP do broker. Ausente => o QueueModule sobe SEM consumer (não quebra o
  // boot local/prod atual). Só configurada após o RabbitMQ no ar (Fase 0, 🔒).
  @IsOptional()
  @IsString()
  RABBITMQ_URL?: string;

  // Kill-switch do consumer. 'true' | 'false' — default 'false' (desligado).
  // Quando 'false' o consumer NÃO registra a subscription (nada consome da fila).
  // Ativar só após o broker validado com o número de TESTE (Fase 1).
  @IsOptional()
  @IsString()
  QUEUE_CONSUMER_ENABLED: string = 'false';

  // Prefetch (QoS) do consumer — quantas mensagens não-ackadas o canal segura.
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  QUEUE_PREFETCH: number = 10;
}

export function validate(config: Record<string, unknown>): AppConfig {
  const validated = plainToInstance(AppConfig, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, {
    skipMissingProperties: false,
    whitelist: false,
  });
  if (errors.length > 0) {
    const messages = errors
      .map((e) => Object.values(e.constraints ?? {}).join(', '))
      .join('\n');
    throw new Error(`Environment validation failed:\n${messages}`);
  }
  return validated;
}
