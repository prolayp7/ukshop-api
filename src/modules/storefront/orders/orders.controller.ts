import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CheckoutDto } from './dto/checkout.dto';
import { OptionalCustomerAuthGuard } from '../../../common/customer/optional-customer-auth.guard';
import { CustomerAuthGuard } from '../../../common/customer/customer-auth.guard';
import { CurrentCustomer } from '../../../common/customer/current-customer.decorator';
import { GuestToken } from '../../../common/customer/guest-token.decorator';
import { AuthenticatedCustomer } from '../../../common/customer/customer-request';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

@Controller('orders')
@UseGuards(OptionalCustomerAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @HttpCode(201)
  checkout(
    @CurrentCustomer() customer: AuthenticatedCustomer | undefined,
    @GuestToken() guestToken: string | undefined,
    @Body() dto: CheckoutDto,
  ) {
    return this.ordersService.checkout(customer?.id, guestToken, dto);
  }

  @Get()
  @UseGuards(CustomerAuthGuard)
  list(@CurrentCustomer() customer: AuthenticatedCustomer, @Query() query: PaginationQueryDto) {
    return this.ordersService.list(customer.id, query);
  }

  @Get(':uuid')
  @UseGuards(CustomerAuthGuard)
  detail(@CurrentCustomer() customer: AuthenticatedCustomer, @Param('uuid') uuid: string) {
    return this.ordersService.detail(customer.id, uuid);
  }
}
