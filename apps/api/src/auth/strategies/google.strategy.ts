import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
    super({
      clientID: config.get('GOOGLE_CLIENT_ID') || 'google-oauth-not-configured',
      clientSecret: config.get('GOOGLE_CLIENT_SECRET') || 'google-secret-not-configured',
      callbackURL: config.get('GOOGLE_CALLBACK_URL') || 'http://localhost:3005/api/auth/google/callback',
      scope: ['email', 'profile'],
    });
  }

  async validate(accessToken: string, refreshToken: string, profile: any, done: VerifyCallback) {
    const user = {
      googleId: profile.id,
      email: profile.emails[0].value,
      name: profile.displayName,
      avatar: profile.photos?.[0]?.value,
    };
    done(null, user);
  }
}
