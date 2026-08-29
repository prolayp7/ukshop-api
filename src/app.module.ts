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
  ],
  controllers: [AppController],
})
export class AppModule {}
