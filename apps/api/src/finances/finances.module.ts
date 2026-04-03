import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { FinancesController } from './finances.controller';
import { FinancesService } from './finances.service';

@Module({
  imports: [
    CacheModule.register({
      ttl: 3600000,
    }),
  ],
  controllers: [FinancesController],
  providers: [FinancesService],
  exports: [FinancesService],
})
export class FinancesModule {}
