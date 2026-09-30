import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { normaliseRegisterPage } from './register-page-settings';
import { normaliseFooter } from './footer-settings';
import { normaliseTopBar } from './top-bar-settings';

const GENERAL_SETTINGS_KEY = 'general.site';
export const REGISTER_PAGE_SETTINGS_KEY = 'register.page';
export const FOOTER_SETTINGS_KEY = 'footer.site';
export const TOP_BAR_SETTINGS_KEY = 'topbar.site';

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

  // Newsletter block, about line and payment badges of the storefront footer, admin-managed.
  async footer() {
    const row = await this.prisma.setting.findUnique({ where: { key: FOOTER_SETTINGS_KEY } });
    return normaliseFooter(row?.value);
  }

  // The strip above the storefront header (track order, popular searches, help link), admin-managed.
  async topBar() {
    const row = await this.prisma.setting.findUnique({ where: { key: TOP_BAR_SETTINGS_KEY } });
    return normaliseTopBar(row?.value);
  }
}
