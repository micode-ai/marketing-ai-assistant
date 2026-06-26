import { Module } from '@nestjs/common';
import { MetaOAuthController } from './meta-oauth.controller';
import { MetaOAuthService } from './meta-oauth.service';
import { SocialModule } from '../social/social.module';

@Module({
  imports: [SocialModule],
  controllers: [MetaOAuthController],
  providers: [MetaOAuthService],
})
export class MetaOAuthModule {}
