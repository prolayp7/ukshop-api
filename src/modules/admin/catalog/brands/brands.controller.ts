import { Revalidates } from '../../../revalidation/revalidates.decorator';
import { onBrand } from '../../../revalidation/resolvers';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminAuthGuard } from '../../../../common/admin/admin-auth.guard';
import { PermissionsGuard } from '../../../../common/admin/permissions.guard';
import { RequirePermissions } from '../../../../common/admin/permissions.decorator';
import { ListBrandsQueryDto } from './dto/list-brands-query.dto';
import { BrandsService } from './brands.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';

@Controller('admin/brands')
@UseGuards(AdminAuthGuard, PermissionsGuard)
@RequirePermissions('products.manage')
export class BrandsController {
  constructor(private readonly brandsService: BrandsService) {}

  @Get()
  list(@Query() query: ListBrandsQueryDto) {
    return this.brandsService.list(query);
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.brandsService.detail(id);
  }

  @Revalidates(onBrand) @Post()
  @HttpCode(201)
  create(@Body() dto: CreateBrandDto) {
    return this.brandsService.create(dto);
  }

  @Revalidates(onBrand) @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateBrandDto) {
    return this.brandsService.update(id, dto);
  }

  @Revalidates(onBrand) @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.brandsService.remove(id);
  }
}
