import { Module } from '@nestjs/common';
import { ShippingMethodsController } from './shipping-methods.controller';
import { ShippingMethodsService } from './shipping-methods.service';
import { ShipmentsController } from './shipments.controller';
import { ShipmentsService } from './shipments.service';

@Module({
  controllers: [ShippingMethodsController, ShipmentsController],
  providers: [ShippingMethodsService, ShipmentsService],
})
export class ShippingMethodsModule {}
