import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class StorefrontMenusService {
  constructor(private readonly prisma: PrismaService) {}

  async bySlug(slug: string) {
    const menu = await this.prisma.menu.findFirst({
      where: { slug, status: 'ACTIVE' },
      include: {
        items: {
          where: { parentId: null, status: 'ACTIVE' },
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            label: true,
            href: true,
            sortOrder: true,
            icon: true,
            highlight: true,
            category: { select: { id: true, title: true, slug: true, parentId: true } },
            // Header mega-menu content; footer items have none.
            megaMenuPanel: {
              select: {
                mode: true,
                eyebrow: true,
                promoEnabled: true,
                promoTitle: true,
                promoText: true,
                promoCta: true,
                promoHref: true,
                promoCategory: { select: { title: true, slug: true, parentId: true } },
                columns: {
                  orderBy: { sortOrder: 'asc' },
                  select: { title: true, links: { orderBy: { sortOrder: 'asc' }, select: { label: true, href: true, category: { select: { title: true, slug: true, parentId: true } } } } },
                },
              },
            },
            children: {
              where: { status: 'ACTIVE' },
              orderBy: { sortOrder: 'asc' },
              select: {
                id: true,
                label: true,
                href: true,
                    sortOrder: true,
                category: { select: { id: true, title: true, slug: true } },
              },
            },
          },
        },
      },
    });
    if (!menu) throw new NotFoundException('Menu not found');
    return menu;
  }
}
