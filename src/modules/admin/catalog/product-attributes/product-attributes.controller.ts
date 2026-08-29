import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../../../common/admin/admin-auth.guard';
import { PermissionsGuard } from '../../../../common/admin/permissions.guard';
import { RequirePermissions } from '../../../../common/admin/permissions.decorator';
import { CreateProductAttributeDto } from './dto/create-product-attribute.dto';
import { CreateProductAttributeValueDto } from './dto/create-product-attribute-value.dto';
import { ProductAttributesService } from './product-attributes.service';

@Controller('admin/product-attributes')
@UseGuards(AdminAuthGuard, PermissionsGuard)
@RequirePermissions('products.manage')
export class ProductAttributesController {
  constructor(private readonly service: ProductAttributesService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  @HttpCode(201)
  create(@Body() dto: CreateProductAttributeDto) {
    return this.service.create(dto);
  }

  @Post(':id/values')
  @HttpCode(201)
  createValue(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateProductAttributeValueDto,
  ) {
    return this.service.createValue(id, dto);
  }
}
