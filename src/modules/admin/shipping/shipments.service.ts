import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

type ShipmentRow = {
  id: number; uuid: string; order_id: number; carrier: string; idempotency_key: string; carrier_shipment_id: string | null;
  tracking_number: string | null; tracking_url: string | null; service_code: string; status: string; weight_kg: Prisma.Decimal;
  length_cm: Prisma.Decimal | null; width_cm: Prisma.Decimal | null; height_cm: Prisma.Decimal | null; declared_value: Prisma.Decimal;
  currency: string; shipping_cost: Prisma.Decimal | null; label_format: string; label_url: string | null;
  estimated_delivery_at: Date | null; delivered_at: Date | null; failure_code: string | null; failure_message: string | null;
  retryable: boolean; created_at: Date; updated_at: Date;
};

@Injectable()
export class ShipmentsService {
  constructor(private readonly prisma: PrismaService) {}

  list(orderId?: number) {
    return this.prisma.$queryRaw<ShipmentRow[]>`
      SELECT id, uuid, order_id, carrier::text, idempotency_key, carrier_shipment_id, tracking_number, tracking_url,
        service_code, status::text, weight_kg, length_cm, width_cm, height_cm, declared_value, currency, shipping_cost,
        label_format, label_url, estimated_delivery_at, delivered_at, failure_code, failure_message, retryable, created_at, updated_at
      FROM shipments WHERE (${orderId ?? null}::integer IS NULL OR order_id = ${orderId ?? null}) ORDER BY created_at DESC
    `;
  }

  async detail(uuid: string) {
    const [shipment] = await this.prisma.$queryRaw<ShipmentRow[]>`
      SELECT id, uuid, order_id, carrier::text, idempotency_key, carrier_shipment_id, tracking_number, tracking_url,
        service_code, status::text, weight_kg, length_cm, width_cm, height_cm, declared_value, currency, shipping_cost,
        label_format, label_url, estimated_delivery_at, delivered_at, failure_code, failure_message, retryable, created_at, updated_at
      FROM shipments WHERE uuid = ${uuid} LIMIT 1
    `;
    if (!shipment) throw new NotFoundException('Shipment not found');
    const events = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT id, provider_event_id, status::text, event_code, description, location, occurred_at, created_at
      FROM shipment_events WHERE shipment_id = ${shipment.id} ORDER BY occurred_at ASC
    `;
    return { ...shipment, events };
  }
}
