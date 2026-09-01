import { Controller, Get, Param, Query } from '@nestjs/common';
import { StorefrontProductsService } from './storefront-products.service';
import { ListStorefrontProductsQueryDto } from './dto/list-storefront-products-query.dto';

@Controller('products')
export class StorefrontProductsController {
  constructor(private readonly productsService: StorefrontProductsService) {}

  @Get()
  list(@Query() query: ListStorefrontProductsQueryDto) {
    return this.productsService.list(query);
  }

  @Get(':slug')
  bySlug(@Param('slug') slug: string) {
    return this.productsService.bySlug(slug);
  }
}
