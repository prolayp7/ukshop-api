import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { buildPaginationMeta, paginationSkipTake } from '../../../common/pagination';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(page: number, perPage: number) {
    const where = { deletedAt: null };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        ...paginationSkipTake(page, perPage),
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          uuid: true,
          email: true,
          firstName: true,
          lastName: true,
          status: true,
          createdAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, meta: buildPaginationMeta(page, perPage, total) };
  }

  async detail(id: number) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: { addresses: true },
    });
    if (!user) throw new NotFoundException('Customer not found');
    const { passwordHash: _passwordHash, ...safe } = user;
    return safe;
  }

  async update(id: number, dto: UpdateCustomerDto) {
    await this.detail(id);
    const updated = await this.prisma.user.update({ where: { id }, data: dto });
    const { passwordHash: _passwordHash, ...safe } = updated;
    return safe;
  }

  async orders(id: number) {
    await this.detail(id);
    return this.prisma.order.findMany({
      where: { userId: id },
      orderBy: { placedAt: 'desc' },
    });
  }
}
