import { Controller, Post, Get, Body, Query, Headers, RawBodyRequest, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { BillingService } from './billing.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Request } from 'express';

@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(private billingService: BillingService) {}

  @Post('checkout')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create Stripe checkout session' })
  createCheckout(
    @CurrentUser() user: any,
    @Body() body: { organizationId: string; plan: string; successUrl: string; cancelUrl: string },
  ) {
    return this.billingService.createCheckoutSession(
      body.organizationId, body.plan, body.successUrl, body.cancelUrl,
    );
  }

  @Post('portal')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create Stripe billing portal session' })
  createPortal(
    @Body() body: { organizationId: string; returnUrl: string },
  ) {
    return this.billingService.createPortalSession(body.organizationId, body.returnUrl);
  }

  @Get('subscription')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get organization subscription' })
  getSubscription(@Query('organizationId') organizationId: string) {
    return this.billingService.getSubscription(organizationId);
  }

  @Public()
  @Post('webhook')
  @ApiOperation({ summary: 'Stripe webhook handler' })
  handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    return this.billingService.handleWebhook(req.rawBody as Buffer, signature);
  }
}
