import { plainToInstance, Type } from 'class-transformer';
import { IsString, IsNumber, IsOptional, Min, validateSync } from 'class-validator';

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
  @IsString()
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

  // ---- Google Sheets ----
  @IsOptional()
  @IsString()
  SHEETS_DOCUMENT_ID?: string;

  @IsOptional()
  @IsString()
  GOOGLE_SERVICE_ACCOUNT_JSON?: string;
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
