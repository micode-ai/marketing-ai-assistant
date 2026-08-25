import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { GoogleIntegrationsModule } from '../google-integrations/google-integrations.module';

@Module({
  // Search Console figures for the recommendations digest. Nothing in
  // google-integrations imports analytics, so this does not cycle.
  imports: [GoogleIntegrationsModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
