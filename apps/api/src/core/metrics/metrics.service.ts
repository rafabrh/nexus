import { Injectable, type OnModuleInit } from '@nestjs/common';
import {
  Registry,
  Counter,
  Histogram,
  Gauge,
  collectDefaultMetrics,
} from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  readonly registry: Registry;

  // --- Counters ---
  readonly httpRequestsTotal: Counter<string>;
  readonly wsConnectionsTotal: Counter<string>;
  readonly authAttemptsTotal: Counter<string>;
  readonly eventsPublishedTotal: Counter<string>;

  // --- Histograms ---
  readonly httpRequestDuration: Histogram<string>;
  readonly redisOperationDuration: Histogram<string>;

  // --- Gauges ---
  readonly wsActiveConnections: Gauge<string>;
  readonly redisConnected: Gauge<string>;

  constructor() {
    this.registry = new Registry();

    this.httpRequestsTotal = new Counter({
      name: 'nexus_http_requests_total',
      help: 'Total HTTP requests',
      labelNames: ['method', 'path', 'status'],
      registers: [this.registry],
    });

    this.wsConnectionsTotal = new Counter({
      name: 'nexus_ws_connections_total',
      help: 'Total WebSocket connections',
      labelNames: ['instancia'],
      registers: [this.registry],
    });

    this.authAttemptsTotal = new Counter({
      name: 'nexus_auth_attempts_total',
      help: 'Total authentication attempts',
      labelNames: ['method', 'success'],
      registers: [this.registry],
    });

    this.eventsPublishedTotal = new Counter({
      name: 'nexus_events_published_total',
      help: 'Total events published to Socket.IO',
      labelNames: ['type', 'instancia'],
      registers: [this.registry],
    });

    this.httpRequestDuration = new Histogram({
      name: 'nexus_http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'path', 'status'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    this.redisOperationDuration = new Histogram({
      name: 'nexus_redis_operation_duration_seconds',
      help: 'Redis operation duration in seconds',
      labelNames: ['operation'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25],
      registers: [this.registry],
    });

    this.wsActiveConnections = new Gauge({
      name: 'nexus_ws_active_connections',
      help: 'Current active WebSocket connections',
      labelNames: ['instancia'],
      registers: [this.registry],
    });

    this.redisConnected = new Gauge({
      name: 'nexus_redis_connected',
      help: 'Whether Redis is connected (1) or not (0)',
      registers: [this.registry],
    });
  }

  onModuleInit(): void {
    collectDefaultMetrics({ register: this.registry });
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }
}
