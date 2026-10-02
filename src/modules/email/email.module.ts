import { Global, Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { LowStockAlertService } from './low-stock-alert.service';
import { WishlistAlertService } from './wishlist-alert.service';
import { SettingsModule } from '../admin/settings/settings.module';

@Global()
@Module({
  imports: [SettingsModule],
  providers: [EmailService, LowStockAlertService, WishlistAlertService],
  exports: [EmailService, LowStockAlertService, WishlistAlertService],
})
export class EmailModule {}
