import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../../../common/admin/admin-auth.guard';
import { PermissionsGuard } from '../../../../common/admin/permissions.guard';
import { RequirePermissions } from '../../../../common/admin/permissions.decorator';
import { CouponsService } from './coupons.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { ListCouponsQueryDto } from './dto/list-coupons-query.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';

@Controller('admin/coupons') @UseGuards(AdminAuthGuard, PermissionsGuard) @RequirePermissions('marketing.manage')
export class CouponsController {
  constructor(private readonly service: CouponsService) {}
  @Get() list(@Query() query: ListCouponsQueryDto) { return this.service.list(query); }
  @Post() @HttpCode(201) create(@Body() dto: CreateCouponDto) { return this.service.create(dto); }
  @Patch(':id') update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCouponDto) { return this.service.update(id, dto); }
  @Delete(':id') @HttpCode(204) async remove(@Param('id', ParseIntPipe) id: number): Promise<void> { await this.service.remove(id); }
}
