import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { BillingModule } from './billing/billing.module';
import { ProjectsModule } from './projects/projects.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { ContentModule } from './content/content.module';
import { EmailModule } from './email/email.module';
import { ChecklistsModule } from './checklists/checklists.module';
import { DocumentsModule } from './documents/documents.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AgentModule } from './agent/agent.module';
import { SocialModule } from './social/social.module';
import { TrackingModule } from './tracking/tracking.module';
import { CommonModule } from './common/common.module';
import { DatabaseModule } from './database/database.module';
import { SeoModule } from './seo/seo.module';
import { ABTestingModule } from './ab-testing/ab-testing.module';
import { EmailSequencesModule } from './email-sequences/email-sequences.module';
import { ChatModule } from './chat/chat.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { GoogleIntegrationsModule } from './google-integrations/google-integrations.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'] }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6380'),
      },
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    CommonModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    BillingModule,
    ProjectsModule,
    CampaignsModule,
    ContentModule,
    EmailModule,
    ChecklistsModule,
    DocumentsModule,
    AnalyticsModule,
    AgentModule,
    SocialModule,
    TrackingModule,
    SeoModule,
    ABTestingModule,
    EmailSequencesModule,
    ChatModule,
    WebhooksModule,
    GoogleIntegrationsModule,
  ],
})
export class AppModule {}
