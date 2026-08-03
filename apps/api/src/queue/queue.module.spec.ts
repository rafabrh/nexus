import { describe, it, expect, afterEach } from 'vitest';
import { QueueModule } from './queue.module';
import { EvolutionQueueConsumer } from './evolution-queue.consumer';

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
});
