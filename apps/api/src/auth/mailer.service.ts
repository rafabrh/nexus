import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import { Resend } from 'resend';

type MailerMode = 'smtp' | 'resend' | 'log';

/**
 * Envio de email transacional (magic link). O transporte é decidido uma vez no
 * boot a partir da config, em ordem de precedência:
 *   1. SMTP   — quando SMTP_HOST/USER/PASS estão setados (ex.: email oficial).
 *   2. Resend — quando há RESEND_API_KEY.
 *   3. log    — nenhum configurado: o link só vai pro log (dev / teste).
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly from: string;
  readonly mode: MailerMode;
  private readonly transporter?: Transporter;
  private readonly resend?: Resend;

  constructor(config: ConfigService) {
    const smtpHost = config.get<string>('SMTP_HOST');
    const smtpUser = config.get<string>('SMTP_USER');
    const smtpPass = config.get<string>('SMTP_PASS');
    const resendKey = config.get<string>('RESEND_API_KEY');

    this.from =
      config.get<string>('MAIL_FROM') ||
      config.get<string>('RESEND_FROM') ||
      smtpUser ||
      'noreply@shkgroup.com.br';

    if (smtpHost && smtpUser && smtpPass) {
      const port = Number(config.get<string>('SMTP_PORT') ?? 587);
      // 465 = TLS implícito; 587 = STARTTLS. SMTP_SECURE força explicitamente.
      const secureCfg = config.get<string>('SMTP_SECURE');
      const secure = secureCfg != null ? secureCfg === 'true' : port === 465;
      this.transporter = createTransport({
        host: smtpHost,
        port,
        secure,
        auth: { user: smtpUser, pass: smtpPass },
      });
      this.mode = 'smtp';
      this.logger.log(`Mailer: SMTP (${smtpHost}:${port}, from ${this.from})`);
    } else if (resendKey) {
      this.resend = new Resend(resendKey);
      this.mode = 'resend';
      this.logger.log(`Mailer: Resend (from ${this.from})`);
    } else {
      this.mode = 'log';
      this.logger.warn(
        'Mailer não configurado (sem SMTP_* nem RESEND_API_KEY). Magic links só vão pro log.',
      );
    }
  }

  async sendMagicLinkEmail(to: string, magicLinkUrl: string): Promise<void> {
    if (this.mode === 'log') {
      this.logger.log(`[DEV] Magic link for ${to}: ${magicLinkUrl}`);
      return;
    }

    const subject = 'NEXUS Panel — Seu link de acesso';
    const html = this.buildHtml(magicLinkUrl);

    try {
      if (this.mode === 'smtp') {
        await this.transporter!.sendMail({ from: this.from, to, subject, html });
      } else {
        const { error } = await this.resend!.emails.send({
          from: this.from,
          to,
          subject,
          html,
        });
        if (error) throw new Error(error.message);
      }
      this.logger.log(`Magic link email sent to ${to} via ${this.mode}`);
    } catch (err) {
      this.logger.error(
        `Failed to send magic link to ${to} via ${this.mode}: ${
          err instanceof Error ? err.message : 'unknown'
        }`,
      );
      throw err;
    }
  }

  private buildHtml(magicLinkUrl: string): string {
    return `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #1a1a1a;">NEXUS Panel</h2>
        <p style="color: #4a4a4a; line-height: 1.6;">
          Clique no botao abaixo para acessar o painel. Este link expira em 15 minutos.
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${magicLinkUrl}"
             style="background-color: #2563eb; color: #ffffff; padding: 14px 32px;
                    border-radius: 8px; text-decoration: none; font-weight: 600;
                    display: inline-block;">
            Acessar Painel
          </a>
        </div>
        <p style="color: #9a9a9a; font-size: 12px; line-height: 1.4;">
          Se voce nao solicitou este email, ignore-o com seguranca.
          <br/>
          Link direto: <a href="${magicLinkUrl}" style="color: #2563eb;">${magicLinkUrl}</a>
        </p>
      </div>
    `;
  }
}
