import { Controller, Get, Post, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EmailService } from './email.service';
import { Public } from '../common/decorators/public.decorator';

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

  @Delete('accounts/:id')
  deleteAccount(@Param('id') id: string) {
    return this.emailService.deleteAccount(id);
  }

  @Post('accounts/:id/test')
  @ApiOperation({ summary: 'Test email account connection' })
  testConnection(@Param('id') id: string) {
    return this.emailService.testConnection(id);
  }

  @Get('lists')
  getLists(@Query('projectId') projectId: string) {
    return this.emailService.findAllLists(projectId);
  }

  @Post('lists')
  createList(@Body() dto: any) {
    return this.emailService.createList(dto);
  }

  @Delete('lists/:id')
  deleteList(@Param('id') id: string) {
    return this.emailService.deleteList(id);
  }

  @Get('lists/:listId/subscribers')
  getSubscribers(@Param('listId') listId: string, @Query('all') all?: string) {
    return this.emailService.getSubscribers(listId, all === 'true');
  }

  @Post('lists/:listId/subscribers')
  addSubscriber(@Param('listId') listId: string, @Body() dto: any) {
    return this.emailService.addSubscriber(listId, dto);
  }

  @Delete('lists/:listId/subscribers/:subscriberId')
  removeSubscriber(
    @Param('listId') listId: string,
    @Param('subscriberId') subscriberId: string,
  ) {
    return this.emailService.removeSubscriber(listId, subscriberId);
  }

  @Public()
  @Get('unsubscribe/:token')
  @ApiOperation({ summary: 'Unsubscribe from email list' })
  unsubscribe(@Param('token') token: string) {
    return this.emailService.unsubscribe(token);
  }

  @Get('campaigns')
  getCampaigns(@Query('projectId') projectId: string) {
    return this.emailService.findCampaignsByProject(projectId);
  }

  @Post('campaigns/send')
  sendCampaign(@Body() dto: any) {
    return this.emailService.sendCampaign(dto);
  }
}
