import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { assertSectionText, withSectionText } from '../../../common/homepage-section-content';
import { ReorderHomepageSectionsDto } from './dto/reorder-homepage-sections.dto';
import { UpdateHomepageSectionDto } from './dto/update-homepage-section.dto';

@Injectable()
export class HomepageSectionsService {
  constructor(private readonly prisma: PrismaService) {}

  // Config comes back with each section's text defaults filled in, so the editor shows what shoppers see.
  async list() {
    const sections = await this.prisma.homepageSection.findMany({ orderBy: { sortOrder: 'asc' } });
    return sections.map((section) => ({ ...section, config: withSectionText(section.type, section.config) }));
  }

  async update(id: number, dto: UpdateHomepageSectionDto) {
    const existing = await this.prisma.homepageSection.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Homepage section not found');
    if (dto.config !== undefined) assertSectionText(existing.type, dto.config);
    const updated = await this.prisma.homepageSection.update({
      where: { id },
      data: {
        ...(dto.label !== undefined ? { label: dto.label } : {}),
        ...(dto.isVisible !== undefined ? { isVisible: dto.isVisible } : {}),
        ...(dto.config !== undefined ? { config: dto.config as Prisma.InputJsonValue } : {}),
      },
    });
    return { ...updated, config: withSectionText(updated.type, updated.config) };
  }

  async reorder(dto: ReorderHomepageSectionsDto) {
    const existing = await this.prisma.homepageSection.findMany({ select: { id: true } });
    const existingIds = new Set(existing.map((row) => row.id));
    if (dto.order.length !== existingIds.size || dto.order.some((id) => !existingIds.has(id))) {
      throw new BadRequestException('order must contain exactly the current set of homepage section ids');
    }
    await this.prisma.$transaction(dto.order.map((id, sortOrder) => this.prisma.homepageSection.update({ where: { id }, data: { sortOrder } })));
    return this.list();
  }
}
