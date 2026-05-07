import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class ResendClient {
  private readonly logger = new Logger(ResendClient.name);
  private readonly client: Resend | null;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    this.from = this.config.get<string>('RESEND_FROM', 'noreply@shkgroups.com');

    if (apiKey) {
      this.client = new Resend(apiKey);
    } else {
      this.client = null;
      this.logger.warn(
        'RESEND_API_KEY not configured. Magic link emails will be logged to console only.',
      );
    }
  }

  async sendMagicLinkEmail(to: string, magicLinkUrl: string): Promise<void> {
    const subject = 'NEXUS Panel — Seu link de acesso';
    const html = `
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

    if (!this.client) {
      this.logger.log(`[DEV] Magic link for ${to}: ${magicLinkUrl}`);
      return;
    }

    try {
      const { error } = await this.client.emails.send({
        from: this.from,
        to,
        subject,
        html,
      });

      if (error) {
        this.logger.error(`Resend email error: ${JSON.stringify(error)}`);
        throw new Error(`Failed to send magic link email: ${error.message}`);
      }

      this.logger.log(`Magic link email sent to ${to}`);
    } catch (err) {
      this.logger.error(
        `Failed to send email to ${to}: ${err instanceof Error ? err.message : 'unknown'}`,
      );
      throw err;
    }
  }
}
