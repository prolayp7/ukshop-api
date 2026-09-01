import { Injectable, NotFoundException } from '@nestjs/common';
import { Category } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

type CategoryNode = Category & { children: CategoryNode[] };

@Injectable()
export class StorefrontCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async tree(): Promise<CategoryNode[]> {
    const categories = await this.prisma.category.findMany({
      where: { status: 'ACTIVE', deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
    });

    const byId = new Map<number, CategoryNode>(categories.map((c) => [c.id, { ...c, children: [] }]));
    const roots: CategoryNode[] = [];
    for (const category of byId.values()) {
      if (category.parentId && byId.has(category.parentId)) {
        byId.get(category.parentId)!.children.push(category);
      } else {
        roots.push(category);
      }
    }
    return roots;
  }

  async bySlug(slug: string) {
    const category = await this.prisma.category.findFirst({
      where: { slug, status: 'ACTIVE', deletedAt: null },
      include: { parent: { select: { id: true, title: true, slug: true } } },
    });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }
}
