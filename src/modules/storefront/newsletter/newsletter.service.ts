import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class NewsletterService {
  constructor(private readonly prisma: PrismaService) {}

  async subscribe(email: string) {
    await this.prisma.newsletterSubscriber.upsert({
      where: { email },
      create: { email },
      update: {},
    });
    return { subscribed: true };
  }
}
