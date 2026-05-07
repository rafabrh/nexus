import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';

@Injectable()
export class EvolutionHealthIndicator extends HealthIndicator {
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    super();
    this.baseUrl = this.config.get<string>(
      'EVOLUTION_API_URL',
      'https://n8n-evolution-api.b8ul3d.easypanel.host',
    );
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.baseUrl}/`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const isHealthy = response.ok;
      const status = this.getStatus(key, isHealthy, {
        statusCode: response.status,
        url: this.baseUrl,
      });

      if (isHealthy) {
        return status;
      }

      throw new HealthCheckError(
        `Evolution API returned ${response.status}`,
        status,
      );
    } catch (error) {
      if (error instanceof HealthCheckError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new HealthCheckError(
        'Evolution API health check failed',
        this.getStatus(key, false, { error: message, url: this.baseUrl }),
      );
    }
  }
}
