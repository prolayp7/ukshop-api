import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmailService } from '../../email/email.service';
import { newsletterSubscribedEmail, STOREFRONT_URL } from '../../email/email-templates';

@Injectable()
export class NewsletterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async subscribe(email: string) {
    const existing = await this.prisma.newsletterSubscriber.findUnique({ where: { email }, select: { id: true, unsubscribedAt: true } });
    const resubscribing = Boolean(existing?.unsubscribedAt);
    const subscriber = await this.prisma.newsletterSubscriber.upsert({
      where: { email },
      create: { email, unsubscribeToken: randomUUID() },
      update: resubscribing ? { unsubscribedAt: null, unsubscribeToken: randomUUID() } : {},
    });
    if (!existing || resubscribing) {
      const unsubscribeUrl = `${STOREFRONT_URL}/api/v1/newsletter/unsubscribe?token=${encodeURIComponent(subscriber.unsubscribeToken)}`;
      const message = newsletterSubscribedEmail(unsubscribeUrl);
      void this.emailService.send(email, message.subject, message.html, undefined, {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      });
    }
    return { subscribed: true };
  }

  async unsubscribe(token: string): Promise<boolean> {
    const result = await this.prisma.newsletterSubscriber.updateMany({
      where: { unsubscribeToken: token, unsubscribedAt: null },
      data: { unsubscribedAt: new Date() },
    });
    return result.count > 0;
  }
}
