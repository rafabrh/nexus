import { describe, expect, it } from 'vitest';
import { EvolutionGoAdapter } from './evolution-go.adapter';
import type { EvolutionGateway } from './evolution-gateway.port';

describe('EvolutionGoAdapter (@provisional — Fase 0)', () => {
  it('é atribuível a EvolutionGateway (prova o implements em runtime)', () => {
    const adapter: EvolutionGateway = new EvolutionGoAdapter();
    expect(adapter).toBeInstanceOf(EvolutionGoAdapter);
  });

  describe('todo método rejeita apontando p/ a Fase 0 e nomeia o método', () => {
    const adapter = new EvolutionGoAdapter();

    it.each([
      ['sendTextMessage', () => adapter.sendTextMessage('i', 'j', 't')],
      [
        'sendMedia',
        () => adapter.sendMedia('i', 'j', { mediatype: 'image', media: 'b64' }),
      ],
      ['sendWhatsAppAudio', () => adapter.sendWhatsAppAudio('i', 'j', 'b64')],
      [
        'sendContact',
        () => adapter.sendContact('i', 'j', { fullName: 'F', phoneNumber: '5511' }),
      ],
      [
        'sendLocation',
        () => adapter.sendLocation('i', 'j', { latitude: 0, longitude: 0 }),
      ],
      ['getConnectionState', () => adapter.getConnectionState('i')],
      ['probeState', () => adapter.probeState('i')],
      ['getQrCode', () => adapter.getQrCode('i')],
      ['createInstance', () => adapter.createInstance('i')],
      ['deleteInstance', () => adapter.deleteInstance('i')],
      ['findMessages', () => adapter.findMessages('i', 'j')],
      [
        'getBase64FromMediaMessage',
        () =>
          adapter.getBase64FromMediaMessage('i', {
            id: 'x',
            remoteJid: 'j',
            fromMe: false,
          }),
      ],
      ['fetchProfilePictureUrl', () => adapter.fetchProfilePictureUrl('i', 'j')],
      ['findContacts', () => adapter.findContacts('i')],
      ['findChats', () => adapter.findChats('i')],
      ['fetchInstances', () => adapter.fetchInstances()],
      ['healthCheck', () => adapter.healthCheck()],
    ])('%s → rejeita com Error contendo EvolutionGoAdapter + Fase 0 + nome', async (name, call) => {
      await expect(call()).rejects.toThrow(/EvolutionGoAdapter.*Fase 0|Fase 0/);
      await expect(call()).rejects.toThrow(new RegExp(name));
    });
  });
});
