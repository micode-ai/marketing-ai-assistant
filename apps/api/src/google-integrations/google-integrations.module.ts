import { Module } from '@nestjs/common';
import { GoogleIntegrationsController } from './google-integrations.controller';
import { GoogleIntegrationsService } from './google-integrations.service';

@Module({
  controllers: [GoogleIntegrationsController],
  providers: [GoogleIntegrationsService],
  exports: [GoogleIntegrationsService],
})
export class GoogleIntegrationsModule {}
