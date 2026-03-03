import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { WebhooksService } from './webhooks.service';

@ApiTags('webhooks')
@ApiBearerAuth()
@Controller('webhooks')
export class WebhooksController {
  constructor(private webhooksService: WebhooksService) {}

  @Get()
  findAll(@Query('organizationId') organizationId: string) {
    return this.webhooksService.findAll(organizationId);
  }

  @Post()
  create(@Body() dto: { organizationId: string; url: string; events: string[] }) {
    return this.webhooksService.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: { url?: string; events?: string[]; isActive?: boolean }) {
    return this.webhooksService.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.webhooksService.delete(id);
  }

  @Post('test/:id')
  async test(@Param('id') id: string) {
    await this.webhooksService.sendTestEvent(id);
    return { message: 'Webhook test event sent' };
  }
}
