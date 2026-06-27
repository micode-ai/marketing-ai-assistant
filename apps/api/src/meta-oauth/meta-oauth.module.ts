import { Module } from '@nestjs/common';
import { MetaOAuthController } from './meta-oauth.controller';
import { MetaOAuthService } from './meta-oauth.service';
import { MetaTokenRefreshService } from './meta-token-refresh.service';
import { SocialModule } from '../social/social.module';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [SocialModule, DatabaseModule],
  controllers: [MetaOAuthController],
  providers: [MetaOAuthService, MetaTokenRefreshService],
})
export class MetaOAuthModule {}
