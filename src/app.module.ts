import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AdminCoreModule } from './common/admin/admin-core.module';
import { AdminAuthModule } from './modules/admin/auth/admin-auth.module';
import { CustomersModule } from './modules/admin/customers/customers.module';
import { CategoriesModule } from './modules/admin/catalog/categories/categories.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AdminCoreModule,
    AdminAuthModule,
    CustomersModule,
    CategoriesModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
