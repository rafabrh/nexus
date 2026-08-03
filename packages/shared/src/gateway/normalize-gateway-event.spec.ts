import { describe, it, expect } from 'vitest';
import { normalizeGatewayEvent } from './normalize-gateway-event';
import { nodeFixtures } from './fixtures/node.fixtures';
import { goFixtures } from './fixtures/go.fixtures';

describe('normalizeGatewayEvent — Node (identidade)', () => {
  for (const f of nodeFixtures) {
    it(f.name, () => {
      expect(normalizeGatewayEvent(f.raw, f.ctx)).toEqual(f.expected);
    });
  }
});

describe('normalizeGatewayEvent — GO (mapeamento whatsmeow→v1) [@provisional]', () => {
  for (const f of goFixtures) {
    it(f.name, () => {
      expect(normalizeGatewayEvent(f.raw, f.ctx)).toEqual(f.expected);
    });
  }
});
