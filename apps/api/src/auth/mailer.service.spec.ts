import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ConfigService } from '@nestjs/config';

// vi.mock é içado para o topo do módulo; os mocks que o factory referencia
// precisam vir de vi.hoisted, senão são acessados antes da inicialização.
const { sendMailMock, createTransportMock, resendSendMock } = vi.hoisted(() => {
  const sendMailMock = vi.fn(
    async (_opts: { from: string; to: string; subject: string; html: string }) => ({
      messageId: 'x',
    }),
  );
  const createTransportMock = vi.fn(() => ({ sendMail: sendMailMock }));
  const resendSendMock = vi.fn(async () => ({ error: null as { message: string } | null }));
  return { sendMailMock, createTransportMock, resendSendMock };
});

vi.mock('nodemailer', () => ({
  default: { createTransport: createTransportMock },
  createTransport: createTransportMock,
}));
vi.mock('resend', () => ({
  Resend: vi.fn(() => ({ emails: { send: resendSendMock } })),
}));

import { MailerService } from './mailer.service';

function makeConfig(values: Record<string, string | undefined>): ConfigService {
  return { get: (k: string) => values[k] } as unknown as ConfigService;
}

beforeEach(() => vi.clearAllMocks());

describe('MailerService — transport selection', () => {
  it('uses SMTP when SMTP_HOST/USER/PASS are set', async () => {
    const mailer = new MailerService(
      makeConfig({
        SMTP_HOST: 'mail.shkgroup.com.br',
        SMTP_USER: 'noreply@shkgroup.com.br',
        SMTP_PASS: 'pw',
        SMTP_PORT: '465',
      }),
    );
    expect(mailer.mode).toBe('smtp');

    await mailer.sendMagicLinkEmail('user@x.com', 'https://link/abc');

    expect(sendMailMock).toHaveBeenCalledOnce();
    const arg = sendMailMock.mock.calls[0][0];
    expect(arg.to).toBe('user@x.com');
    expect(arg.html).toContain('https://link/abc');
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it('falls back to Resend when only RESEND_API_KEY is set', async () => {
    const mailer = new MailerService(makeConfig({ RESEND_API_KEY: 're_x' }));
    expect(mailer.mode).toBe('resend');

    await mailer.sendMagicLinkEmail('user@x.com', 'https://link/abc');

    expect(resendSendMock).toHaveBeenCalledOnce();
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('SMTP takes precedence over Resend when both are configured', () => {
    const mailer = new MailerService(
      makeConfig({ SMTP_HOST: 'h', SMTP_USER: 'u', SMTP_PASS: 'p', RESEND_API_KEY: 're_x' }),
    );
    expect(mailer.mode).toBe('smtp');
  });

  it('falls back to log (sends nothing) when nothing is configured', async () => {
    const mailer = new MailerService(makeConfig({}));
    expect(mailer.mode).toBe('log');

    await mailer.sendMagicLinkEmail('user@x.com', 'https://link/abc');

    expect(sendMailMock).not.toHaveBeenCalled();
    expect(resendSendMock).not.toHaveBeenCalled();
  });
});
