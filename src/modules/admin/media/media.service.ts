import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'; import { MediaOwnerType } from '@prisma/client'; import { existsSync, promises as fs } from 'fs'; import { join } from 'path'; import { PrismaService } from '../../../prisma/prisma.service'; import { mediaUploadDirectory } from '../../../bootstrap'; import { ListMediaQueryDto, UpdateMediaDto, UploadMediaDto } from './dto/media.dto';
export interface UploadedMediaFile { filename: string; originalname: string; mimetype: string; size: number; path: string; }
const extensionByType: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/avif': '.avif' };
@Injectable() export class MediaService {
  constructor(private readonly prisma: PrismaService) {}
  async assertOwner(type: MediaOwnerType, id: number) {
    const exists = await this.ownerExists(type, id); if (!exists) throw new NotFoundException(`${type.toLowerCase()} owner not found`);
  }
  private ownerExists(type: MediaOwnerType, id: number): Promise<unknown> {
    switch (type) {
      case 'PRODUCT': return this.prisma.product.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
      case 'PRODUCT_VARIANT': return this.prisma.productVariant.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
      case 'CATEGORY': return this.prisma.category.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
      case 'BRAND': return this.prisma.brand.findUnique({ where: { id }, select: { id: true } });
      case 'BLOG_POST': return this.prisma.blogPost.findUnique({ where: { id }, select: { id: true } });
      case 'BLOG_CATEGORY': return this.prisma.blogCategory.findUnique({ where: { id }, select: { id: true } });
      case 'AUTHOR': return this.prisma.author.findUnique({ where: { id }, select: { id: true } });
      case 'PAGE': return this.prisma.page.findUnique({ where: { id }, select: { id: true } });
      case 'BANNER': return this.prisma.banner.findUnique({ where: { id }, select: { id: true } });
      case 'TESTIMONIAL': return this.prisma.testimonial.findUnique({ where: { id }, select: { id: true } });
      case 'HERO_SLIDE': return this.prisma.heroSlide.findUnique({ where: { id }, select: { id: true } });
      case 'USER': return this.prisma.user.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
      case 'REVIEW': return this.prisma.review.findUnique({ where: { id }, select: { id: true } });
      case 'ORDER_ITEM_RETURN': return this.prisma.orderItemReturn.findUnique({ where: { id }, select: { id: true } });
    }
  }
  async list(query: ListMediaQueryDto) { await this.assertOwner(query.ownerType, query.ownerId); return this.prisma.media.findMany({ where: { ownerType: query.ownerType, ownerId: query.ownerId, ...(query.collection ? { collection: query.collection } : {}) }, orderBy: [{ collection: 'asc' }, { sortOrder: 'asc' }] }); }
  async create(dto: UploadMediaDto, file?: UploadedMediaFile) {
    if (!file) throw new BadRequestException('Image file is required');
    try {
      const extension = extensionByType[file.mimetype]; if (!extension) throw new BadRequestException('Unsupported image type');
      await this.assertOwner(dto.ownerType, dto.ownerId);
      const filename = `${file.filename}${extension}`; const target = join(mediaUploadDirectory, filename); await fs.rename(file.path, target);
      return await this.prisma.media.create({ data: { ...dto, url: `/uploads/${filename}`, metadata: { originalName: file.originalname, mimeType: file.mimetype, size: file.size } } });
    } catch (error) { if (file.path && existsSync(file.path)) await fs.unlink(file.path).catch(() => undefined); throw error; }
  }
  async update(id: number, dto: UpdateMediaDto) { const media = await this.prisma.media.findUnique({ where: { id } }); if (!media) throw new NotFoundException('Media not found'); return this.prisma.media.update({ where: { id }, data: dto }); }
  async remove(id: number) { const media = await this.prisma.media.findUnique({ where: { id } }); if (!media) throw new NotFoundException('Media not found'); await this.prisma.media.delete({ where: { id } }); if (media.url.startsWith('/uploads/')) { const filename = media.url.slice('/uploads/'.length); if (filename && filename === filename.split('/').pop()) await fs.unlink(join(mediaUploadDirectory, filename)).catch(() => undefined); } }
}
