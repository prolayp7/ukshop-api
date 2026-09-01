import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';

@Injectable()
export class StorefrontBrandsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.brand.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { title: 'asc' },
    });
  }

  async bySlug(slug: string) {
    const brand = await this.prisma.brand.findFirst({ where: { slug, status: 'ACTIVE' } });
    if (!brand) throw new NotFoundException('Brand not found');
    return brand;
  }
}
