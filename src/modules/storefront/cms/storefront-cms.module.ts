import { Module } from '@nestjs/common';
import {
  StorefrontFaqsController,
  StorefrontPagesController,
  StorefrontTestimonialsController,
} from './storefront-cms.controller';
import { StorefrontCmsService } from './storefront-cms.service';

@Module({
  controllers: [
    StorefrontPagesController,
    StorefrontFaqsController,
    StorefrontTestimonialsController,
  ],
  providers: [StorefrontCmsService],
})
export class StorefrontCmsModule {}
