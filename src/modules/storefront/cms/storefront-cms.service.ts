import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class StorefrontCmsService {
  constructor(private readonly prisma: PrismaService) {}

  async page(slug: string) {
    const page = await this.prisma.page.findFirst({ where: { slug, status: 'PUBLISHED' } });
    if (!page) throw new NotFoundException('Page not found');
    return page;
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
