import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { normaliseRegisterPage } from './register-page-settings';

const GENERAL_SETTINGS_KEY = 'general.site';
export const REGISTER_PAGE_SETTINGS_KEY = 'register.page';

@Injectable()
export class StorefrontSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async general(): Promise<Record<string, unknown>> {
    const row = await this.prisma.setting.findUnique({ where: { key: GENERAL_SETTINGS_KEY } });
    return (row?.value as Record<string, unknown>) ?? {};
  }

  // Content of the "Create account" page (heading block, showcase column, benefits row), admin-managed.
  async registerPage() {
    const row = await this.prisma.setting.findUnique({ where: { key: REGISTER_PAGE_SETTINGS_KEY } });
    return normaliseRegisterPage(row?.value);
  }
}
