import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AdminCoreModule } from './common/admin/admin-core.module';
import { AdminAuthModule } from './modules/admin/auth/admin-auth.module';
import { CustomersModule } from './modules/admin/customers/customers.module';
import { CategoriesModule } from './modules/admin/catalog/categories/categories.module';
import { BrandsModule } from './modules/admin/catalog/brands/brands.module';
import { ProductConditionsModule } from './modules/admin/catalog/product-conditions/product-conditions.module';
import { TaxRatesModule } from './modules/admin/catalog/tax-rates/tax-rates.module';
import { ProductAttributesModule } from './modules/admin/catalog/product-attributes/product-attributes.module';
import { ProductsModule } from './modules/admin/catalog/products/products.module';
import { SettingsModule } from './modules/admin/settings/settings.module';
import { ShippingMethodsModule } from './modules/admin/shipping/shipping-methods.module';
import { OrdersModule } from './modules/admin/orders/orders.module';
import { RbacModule } from './modules/admin/rbac/rbac.module';
import { CollectionsModule } from './modules/admin/catalog/collections/collections.module';
import { CouponsModule } from './modules/admin/marketing/coupons/coupons.module';
import { PaymentOperationsModule } from './modules/admin/payment-operations/payment-operations.module';
import { ReviewsModule } from './modules/admin/reviews/reviews.module';
import { GiftCardsModule } from './modules/admin/gift-cards/gift-cards.module';
import { MerchandisingModule } from './modules/admin/merchandising/merchandising.module';
import { MenusModule } from './modules/admin/menus/menus.module';
import { CmsModule } from './modules/admin/cms/cms.module';
import { NotificationsModule } from './modules/admin/notifications/notifications.module';
import { ReportsModule } from './modules/admin/reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AdminCoreModule,
    AdminAuthModule,
    CustomersModule,
    CategoriesModule,
    BrandsModule,
    ProductConditionsModule,
    TaxRatesModule,
    ProductAttributesModule,
    ProductsModule,
    SettingsModule,
    ShippingMethodsModule,
    OrdersModule,
    RbacModule,
    CollectionsModule,
    CouponsModule,
    PaymentOperationsModule,
    ReviewsModule,
    GiftCardsModule,
    MerchandisingModule,
    MenusModule,
    CmsModule,
    NotificationsModule,
    ReportsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
