import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CreateProductAttributeDto } from './dto/create-product-attribute.dto';
import { CreateProductAttributeValueDto } from './dto/create-product-attribute-value.dto';

@Injectable()
export class ProductAttributesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.productAttribute.findMany({
      where: { deletedAt: null },
      include: { values: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { title: 'asc' },
    });
  }

  async create(dto: CreateProductAttributeDto) {
    const existing = await this.prisma.productAttribute.findFirst({
      where: { slug: dto.slug, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException(`Product attribute slug "${dto.slug}" is already in use`);
    }
    return this.prisma.productAttribute.create({ data: dto, include: { values: true } });
  }

  async createValue(attributeId: number, dto: CreateProductAttributeValueDto) {
    const attribute = await this.prisma.productAttribute.findFirst({
      where: { id: attributeId, deletedAt: null },
      select: { id: true },
    });
    if (!attribute) throw new NotFoundException('Product attribute not found');

    try {
      return await this.prisma.productAttributeValue.create({
        data: { ...dto, attributeId },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`Attribute value "${dto.value}" already exists`);
      }
      throw error;
    }
  }
}
