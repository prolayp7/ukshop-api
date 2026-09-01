import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { buildPaginationMeta, paginationSkipTake } from '../../../common/pagination';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { UpdateTrackingDto } from './dto/update-tracking.dto';
import { UpdateOrderItemStatusDto } from './dto/update-order-item-status.dto';

const detailInclude = {
  user: { select: { id: true, email: true, firstName: true, lastName: true } },
  shippingMethod: true,
  items: { include: { product: true, productVariant: true } },
  statusHistory: { include: { changedByAdmin: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'asc' as const } },
  paymentTransactions: { orderBy: { createdAt: 'desc' as const } },
};

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async summary() {
    const revenueStatuses: OrderStatus[] = ['PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED'];
    const [totalOrders, awaitingPayment, failedPayments, revenue, average] = await Promise.all([
      this.prisma.order.count(),
      this.prisma.order.count({ where: { status: 'AWAITING_PAYMENT' } }),
      this.prisma.order.count({ where: { paymentStatus: 'FAILED' } }),
      this.prisma.order.aggregate({
        where: { status: { in: revenueStatuses } },
        _sum: { total: true },
      }),
      this.prisma.order.aggregate({ _avg: { total: true } }),
    ]);
    return {
      totalOrders,
      awaitingPayment,
      failedPayments,
      revenue: Number(revenue._sum.total ?? 0),
      averageOrderValue: Number(average._avg.total ?? 0),
    };
  }

  async list(query: ListOrdersQueryDto) {
    const page = query.page!;
    const perPage = query.perPage!;
    if (query.dateFrom && query.dateTo && new Date(query.dateFrom) > new Date(query.dateTo)) {
      throw new BadRequestException('dateFrom cannot be after dateTo');
    }
    const where: Prisma.OrderWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.paymentStatus ? { paymentStatus: query.paymentStatus } : {}),
      ...(query.q ? { OR: [
        { orderNumber: { contains: query.q, mode: 'insensitive' } },
        { email: { contains: query.q, mode: 'insensitive' } },
      ] } : {}),
      ...((query.dateFrom || query.dateTo) ? { placedAt: {
        ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
      } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.order.findMany({ where, ...paginationSkipTake(page, perPage), include: { user: { select: { id: true, firstName: true, lastName: true } }, _count: { select: { items: true } } }, orderBy: { placedAt: 'desc' } }),
      this.prisma.order.count({ where }),
    ]);
    return { items, meta: buildPaginationMeta(page, perPage, total) };
  }

  async detail(id: number) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: detailInclude });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async updateStatus(id: number, adminId: number, dto: UpdateOrderStatusDto) {
    const order = await this.detail(id);
    if (order.status === dto.toStatus) throw new BadRequestException('Order already has that status');
    return this.prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id }, data: { status: dto.toStatus } });
      await tx.orderStatusHistory.create({ data: {
        orderId: id, fromStatus: order.status, toStatus: dto.toStatus,
        note: dto.note, changedByAdminId: adminId,
      } });
      return tx.order.findUniqueOrThrow({ where: { id }, include: detailInclude });
    });
  }

  async updateTracking(id: number, dto: UpdateTrackingDto) {
    await this.detail(id);
    return this.prisma.order.update({ where: { id }, data: dto });
  }

  async updateItemStatus(id: number, itemId: number, dto: UpdateOrderItemStatusDto) {
    await this.detail(id);
    const item = await this.prisma.orderItem.findFirst({ where: { id: itemId, orderId: id } });
    if (!item) throw new NotFoundException('Order item not found');
    return this.prisma.orderItem.update({ where: { id: itemId }, data: { status: dto.status } });
  }

  async updateNote(id: number, adminNote: string) {
    await this.detail(id);
    return this.prisma.order.update({ where: { id }, data: { adminNote } });
  }
}
