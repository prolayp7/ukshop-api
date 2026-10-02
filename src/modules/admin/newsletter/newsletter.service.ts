import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { EmailService } from '../../email/email.service';
import { newsletterCampaignEmail, STOREFRONT_URL } from '../../email/email-templates';
import { buildPaginationMeta, paginationSkipTake } from '../../../common/pagination';
import { dateRange } from '../../../common/date-range';
import { ListSubscribersQueryDto } from './dto/list-subscribers-query.dto';
import { SendNewsletterCampaignDto } from './dto/send-newsletter-campaign.dto';

@Injectable()
export class AdminNewsletterService {
  constructor(private readonly prisma: PrismaService, private readonly email: EmailService) {}

  async list(query: ListSubscribersQueryDto) {
    const page = query.page!;
    const perPage = query.perPage!;
    const q = query.q?.trim();
    const where: Prisma.NewsletterSubscriberWhereInput = {
      ...(q ? { email: { contains: q, mode: 'insensitive' } } : {}),
      ...dateRange(query.dateFrom, query.dateTo),
    };
    const orderBy: Prisma.NewsletterSubscriberOrderByWithRelationInput = query.sort === 'oldest' ? { createdAt: 'asc' } : query.sort === 'email' ? { email: 'asc' } : { createdAt: 'desc' };
    const [items, total, all, last30Days] = await Promise.all([
      this.prisma.newsletterSubscriber.findMany({ where, ...paginationSkipTake(page, perPage), orderBy, select: { id: true, email: true, createdAt: true, unsubscribedAt: true } }),
      this.prisma.newsletterSubscriber.count({ where }),
      // Headline figures are store-wide, independent of the filters.
      this.prisma.newsletterSubscriber.count({ where: { unsubscribedAt: null } }),
      this.prisma.newsletterSubscriber.count({ where: { unsubscribedAt: null, createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } }),
    ]);
    return { items, meta: { ...buildPaginationMeta(page, perPage, total), summary: { total: all, last30Days } } };
  }

  async sendCampaign(dto: SendNewsletterCampaignDto) {
    const subscribers = await this.prisma.newsletterSubscriber.findMany({
      where: { unsubscribedAt: null },
      select: { email: true, unsubscribeToken: true },
      orderBy: { id: 'asc' },
    });
    let sent = 0;
    let failed = 0;
    for (let offset = 0; offset < subscribers.length; offset += 10) {
      const batch = subscribers.slice(offset, offset + 10);
      const results = await Promise.all(batch.map(async (subscriber) => {
        const unsubscribeUrl = `${STOREFRONT_URL}/api/v1/newsletter/unsubscribe?token=${encodeURIComponent(subscriber.unsubscribeToken)}`;
        const email = newsletterCampaignEmail({ ...dto, unsubscribeUrl });
        return this.email.send(subscriber.email, email.subject, email.html, undefined, {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        });
      }));
      sent += results.filter(Boolean).length;
      failed += results.filter((result) => !result).length;
    }
    return { recipients: subscribers.length, sent, failed };
  }
}
