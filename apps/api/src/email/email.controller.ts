import { Controller, Get, Post, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EmailService } from './email.service';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('email')
@ApiBearerAuth()
@Controller('email')
export class EmailController {
  constructor(private emailService: EmailService) {}

  @Get('accounts')
  getAccounts(@Query('organizationId') organizationId: string) {
    return this.emailService.findAllAccounts(organizationId);
  }

  @Post('accounts')
  createAccount(@Query('organizationId') organizationId: string, @Body() dto: any) {
    return this.emailService.createAccount(organizationId, dto);
  }

  @Get('lists')
  getLists(@Query('projectId') projectId: string) {
    return this.emailService.findAllLists(projectId);
  }

  @Post('lists')
  createList(@Body() dto: any) {
    return this.emailService.createList(dto);
  }

  @Get('lists/:listId/subscribers')
  getSubscribers(@Param('listId') listId: string) {
    return this.emailService.getSubscribers(listId);
  }

  @Post('lists/:listId/subscribers')
  addSubscriber(@Param('listId') listId: string, @Body() dto: any) {
    return this.emailService.addSubscriber(listId, dto);
  }

  @Public()
  @Get('unsubscribe/:token')
  @ApiOperation({ summary: 'Unsubscribe from email list' })
  unsubscribe(@Param('token') token: string) {
    return this.emailService.unsubscribe(token);
  }

  @Post('campaigns/send')
  sendCampaign(@Body() dto: any) {
    return this.emailService.sendCampaign(dto);
  }
}
