import { BadRequestException, Body, Controller, Get, Header, HttpCode, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { NewsletterService } from './newsletter.service';
import { SubscribeNewsletterDto } from './dto/subscribe-newsletter.dto';

@Controller('newsletter')
export class NewsletterController {
  constructor(private readonly newsletterService: NewsletterService) {}

  @Post('subscribe')
  @HttpCode(201)
  subscribe(@Body() dto: SubscribeNewsletterDto) {
    return this.newsletterService.subscribe(dto.email);
  }

  @Get('unsubscribe')
  unsubscribe(@Query('token') token: string | undefined, @Res() response: Response): void {
    if (!token) throw new BadRequestException('Unsubscribe token is required');
    const escapedToken = token.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
    response.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).send(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email preferences</title><body style="font:16px/1.5 system-ui,sans-serif;max-width:560px;margin:12vh auto;padding:24px;color:#101827"><h1 style="font-size:24px">Unsubscribe from newsletter</h1><p>Confirm that you no longer want newsletter campaigns. Order and account emails are not affected.</p><form method="post" action="/api/v1/newsletter/unsubscribe"><input type="hidden" name="token" value="${escapedToken}"><button style="min-height:44px;padding:0 18px;border:0;border-radius:6px;background:#e0201f;color:#fff;font:600 14px system-ui;cursor:pointer">Confirm unsubscribe</button></form></body></html>`);
  }

  @Post('unsubscribe')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async oneClickUnsubscribe(@Query('token') queryToken?: string, @Body('token') bodyToken?: string) {
    const token = queryToken ?? bodyToken;
    if (!token) throw new BadRequestException('Unsubscribe token is required');
    await this.newsletterService.unsubscribe(token);
    return { unsubscribed: true };
  }
}
