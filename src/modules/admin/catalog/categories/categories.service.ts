import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { buildPaginationMeta, paginationSkipTake } from '../../../../common/pagination';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertSlugAvailable(slug: string, excludeId?: number): Promise<void> {
    const existing = await this.prisma.category.findFirst({
      where: { slug, deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
    });
    if (existing) {
      throw new ConflictException(`Category slug "${slug}" is already in use`);
    }
  }

  async list(page: number, perPage: number, parentId?: number, includeDeleted = false) {
    const where = { ...(includeDeleted ? {} : { deletedAt: null }), ...(parentId !== undefined ? { parentId } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.category.findMany({
        where,
        ...paginationSkipTake(page, perPage),
        include: {
          parent: { select: { id: true, title: true } },
          _count: { select: { products: true, secondaryProducts: true, children: true } },
        },
        orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      }),
      this.prisma.category.count({ where }),
    ]);
    return { items, meta: buildPaginationMeta(page, perPage, total) };
  }

  async detail(id: number) {
    const category = await this.prisma.category.findFirst({ where: { id, deletedAt: null } });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  async create(dto: CreateCategoryDto) {
    await this.assertSlugAvailable(dto.slug);
    return this.prisma.category.create({ data: dto });
  }

  async update(id: number, dto: UpdateCategoryDto) {
    await this.detail(id);
    if (dto.slug) {
      await this.assertSlugAvailable(dto.slug, id);
    }
    return this.prisma.category.update({ where: { id }, data: dto });
  }

  async remove(id: number): Promise<void> {
    await this.detail(id);
    await this.prisma.category.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
