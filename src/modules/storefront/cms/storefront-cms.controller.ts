import { Controller, Get, Param } from '@nestjs/common';
import { StorefrontCmsService } from './storefront-cms.service';

@Controller('pages')
export class StorefrontPagesController {
  constructor(private readonly cmsService: StorefrontCmsService) {}

  @Get(':slug')
  page(@Param('slug') slug: string) {
    return this.cmsService.page(slug);
  }
}

@Controller('faqs')
export class StorefrontFaqsController {
  constructor(private readonly cmsService: StorefrontCmsService) {}

  @Get()
  list() {
    return this.cmsService.faqs();
  }
}

@Controller('testimonials')
export class StorefrontTestimonialsController {
  constructor(private readonly cmsService: StorefrontCmsService) {}

  @Get()
  list() {
    return this.cmsService.testimonials();
  }
}
