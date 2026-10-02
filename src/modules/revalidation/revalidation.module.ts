import { Global, Module } from '@nestjs/common';
import { RevalidationService } from './revalidation.service';

// Global so any admin module can inject RevalidationService without importing this module.
@Global()
@Module({ providers: [RevalidationService], exports: [RevalidationService] })
export class RevalidationModule {}
