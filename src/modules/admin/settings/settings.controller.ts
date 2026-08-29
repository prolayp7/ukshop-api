import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../../common/admin/admin-auth.guard';
import { PermissionsGuard } from '../../../common/admin/permissions.guard';
import { RequirePermissions } from '../../../common/admin/permissions.decorator';
import { UpsertSettingDto } from './dto/upsert-setting.dto';
import { SettingsService } from './settings.service';

@Controller('admin/settings')
@UseGuards(AdminAuthGuard, PermissionsGuard)
@RequirePermissions('settings.manage')
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Put(':key')
  upsert(@Param('key') key: string, @Body() dto: UpsertSettingDto) {
    return this.service.upsert(key, dto);
  }
}
