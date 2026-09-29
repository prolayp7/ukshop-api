import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { renderPageContent } from './page-content';

@Injectable()
export class StorefrontCmsService {
  constructor(private readonly prisma: PrismaService) {}

  async page(slug: string) {
    const [page, settings] = await Promise.all([
      this.prisma.page.findFirst({ where: { slug, status: 'PUBLISHED' } }),
      this.prisma.setting.findUnique({ where: { key: 'general.site' } }),
    ]);
    if (!page) throw new NotFoundException('Page not found');
    const siteSettings = settings?.value && typeof settings.value === 'object' ? (settings.value as Record<string, unknown>) : {};
    return { ...page, contentBlocks: renderPageContent(page.contentBlocks, siteSettings) };
  }

  async faqs() {
    return this.prisma.faqCategory.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { sortOrder: 'asc' },
      include: { faqs: { where: { status: 'ACTIVE' }, orderBy: { sortOrder: 'asc' } } },
    });
  }

  async testimonials() {
    return this.prisma.testimonial.findMany({ where: { status: 'ACTIVE' }, orderBy: { sortOrder: 'asc' } });
  }
}
