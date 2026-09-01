import { Module } from '@nestjs/common';
import { PaymentAttemptsService } from './payment-attempts.service';
import { PaymentStateService } from './payment-state.service';
import { PaymentsController } from './payments.controller';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentAttemptsService, PaymentStateService],
  exports: [PaymentAttemptsService, PaymentStateService],
})
export class PaymentsModule {}
