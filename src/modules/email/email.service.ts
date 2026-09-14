import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { SettingsService } from '../admin/settings/settings.service';

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly settings: SettingsService) {}

  private async config(): Promise<SmtpConfig | null> {
    const integration = await this.settings.internalIntegration('email.smtp');
    const cfg = integration?.settings as Record<string, unknown> | undefined;
    if (!cfg?.host || !cfg?.port || !cfg?.user || !cfg?.pass) return null;
    return {
      host: String(cfg.host),
      port: Number(cfg.port),
      secure: Boolean(cfg.secure ?? Number(cfg.port) === 465),
      user: String(cfg.user),
      pass: String(cfg.pass),
      from: String(cfg.fromAddress ?? cfg.user),
    };
  }

  // Best-effort: never throws. Callers fire-and-forget this so a slow/broken
  // SMTP relay never blocks or fails checkout/admin/refund/notification flows.
  // Returns false when SMTP isn't configured (the current default state) or
  // the send itself failed - both are logged, neither is fatal to the caller.
  async send(to: string, subject: string, html: string): Promise<boolean> {
    const cfg = await this.config();
    if (!cfg) {
      this.logger.warn(`Email not sent (SMTP not configured): "${subject}" to ${to}`);
      return false;
    }
    try {
      const transporter = nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        auth: { user: cfg.user, pass: cfg.pass },
      });
      await transporter.sendMail({ from: cfg.from, to, subject, html });
      return true;
    } catch (error) {
      this.logger.warn(`Failed to send email "${subject}" to ${to}: ${(error as Error).message}`);
      return false;
    }
  }
}
