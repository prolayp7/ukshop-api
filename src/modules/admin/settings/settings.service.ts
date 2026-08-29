import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { UpsertSettingDto } from './dto/upsert-setting.dto';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.setting.findMany({ orderBy: { key: 'asc' } });
  }

  upsert(key: string, dto: UpsertSettingDto) {
    if (!key.trim()) throw new BadRequestException('Setting key is required');
    const value = dto.value === null ? Prisma.JsonNull : (dto.value as Prisma.InputJsonValue);
    return this.prisma.setting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }
}
