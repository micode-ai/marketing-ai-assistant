import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { TenantScopeGuard } from './guards/tenant-scope.guard';
import { CronFailureNotifier } from './cron-failure-notifier.service';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: { expiresIn: config.get('JWT_EXPIRES_IN', '15m') },
      }),
    }),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // Must stay after JwtAuthGuard: it reads req.user.memberships.
    {
      provide: APP_GUARD,
      useClass: TenantScopeGuard,
    },
    CronFailureNotifier,
  ],
  exports: [JwtModule, CronFailureNotifier],
})
export class CommonModule {}
