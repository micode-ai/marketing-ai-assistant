import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { UploadsModule } from './uploads/uploads.module';
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
import { GooglePlayModule } from './google-play/google-play.module';
import { InstagramModule } from './instagram/instagram.module';
import { ThreadsModule } from './threads/threads.module';
import { MetaOAuthModule } from './meta-oauth/meta-oauth.module';
import { InvitationsModule } from './invitations/invitations.module';
import { MailModule } from './mail/mail.module';
import { EntityLinksModule } from './entity-links/entity-links.module';
import { DocsModule } from './docs/docs.module';
import { FinancesModule } from './finances/finances.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'] }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    BullModule.forRootAsync({
      useFactory: () => ({
        redis: {
          host: process.env.REDIS_HOST || '127.0.0.1',
          port: parseInt(process.env.REDIS_PORT || '6380'),
          maxRetriesPerRequest: null,
        },
      }),
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    CommonModule,
    MailModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    InvitationsModule,
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
    MetaOAuthModule,
    TrackingModule,
    SeoModule,
    ABTestingModule,
    EmailSequencesModule,
    ChatModule,
    WebhooksModule,
    GoogleIntegrationsModule,
    GooglePlayModule,
    InstagramModule,
    ThreadsModule,
    EntityLinksModule,
    DocsModule,
    FinancesModule,
    UploadsModule,
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), '../../uploads'),
      serveRoot: '/api/uploads',
      serveStaticOptions: { index: false },
    }),
  ],
})
export class AppModule {}
