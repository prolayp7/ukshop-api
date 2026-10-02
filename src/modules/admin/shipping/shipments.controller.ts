import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../../common/admin/admin-auth.guard';
import { PermissionsGuard } from '../../../common/admin/permissions.guard';
import { RequirePermissions } from '../../../common/admin/permissions.decorator';
import { ListShipmentsQueryDto } from './dto/list-shipments-query.dto';
import { ShipmentsService } from './shipments.service';

@Controller('admin/shipments')
@UseGuards(AdminAuthGuard, PermissionsGuard)
@RequirePermissions('shipping.manage')
export class ShipmentsController {
  constructor(private readonly shipments: ShipmentsService) {}

  @Get()
  list(@Query() query: ListShipmentsQueryDto) { return this.shipments.list(query.orderId); }

  @Get(':uuid')
  detail(@Param('uuid') uuid: string) { return this.shipments.detail(uuid); }
}
