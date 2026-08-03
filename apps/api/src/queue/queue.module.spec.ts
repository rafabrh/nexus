import { describe, it, expect, afterEach } from 'vitest';
import { QueueModule } from './queue.module';
import { EvolutionQueueConsumer } from './evolution-queue.consumer';
import { TenantConfigModule } from '../tenant-config/tenant-config.module';
import { GATEWAY_CONFIG_STORE } from '../tenant-config/gateway-config-store';

// Testa o kill-switch no nível da configuração do módulo (sem boot/broker):
// register() decide, por env, se registra o consumer + RabbitMQ ou sobe vazio.
describe('QueueModule.register (kill-switch)', () => {
  const orig = { ...process.env };
  afterEach(() => {
    process.env = { ...orig };
  });

  it('OFF por default: sobe vazio (sem RabbitMQ, sem consumer)', () => {
    delete process.env.QUEUE_CONSUMER_ENABLED;
    delete process.env.RABBITMQ_URL;
    const mod = QueueModule.register();
    expect(mod.providers ?? []).not.toContain(EvolutionQueueConsumer);
    expect(mod.imports ?? []).toHaveLength(0);
  });

  it('OFF quando enabled=true mas RABBITMQ_URL ausente', () => {
    process.env.QUEUE_CONSUMER_ENABLED = 'true';
    delete process.env.RABBITMQ_URL;
    const mod = QueueModule.register();
    expect(mod.providers ?? []).not.toContain(EvolutionQueueConsumer);
    expect(mod.imports ?? []).toHaveLength(0);
  });

  it('OFF quando RABBITMQ_URL presente mas enabled!=true', () => {
    process.env.QUEUE_CONSUMER_ENABLED = 'false';
    process.env.RABBITMQ_URL = 'amqp://guest:guest@localhost:5672';
    const mod = QueueModule.register();
    expect(mod.providers ?? []).not.toContain(EvolutionQueueConsumer);
  });

  it('ON quando enabled=true e RABBITMQ_URL presente: registra consumer + RabbitMQ', () => {
    process.env.QUEUE_CONSUMER_ENABLED = 'true';
    process.env.RABBITMQ_URL = 'amqp://guest:guest@localhost:5672';
    const mod = QueueModule.register();
    expect(mod.providers ?? []).toContain(EvolutionQueueConsumer);
    expect((mod.imports ?? []).length).toBeGreaterThan(0);
  });

  it('ON: cabeia o seam GO — importa TenantConfigModule e binda GATEWAY_CONFIG_STORE', () => {
    process.env.QUEUE_CONSUMER_ENABLED = 'true';
    process.env.RABBITMQ_URL = 'amqp://guest:guest@localhost:5672';
    const mod = QueueModule.register();
    expect(mod.imports ?? []).toContain(TenantConfigModule);
    const hasStoreBinding = (mod.providers ?? []).some(
      (p: any) => p && p.provide === GATEWAY_CONFIG_STORE,
    );
    expect(hasStoreBinding).toBe(true);
  });
});
