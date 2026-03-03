import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ABTestingService } from './ab-testing.service';

@ApiTags('ab-testing')
@ApiBearerAuth()
@Controller('ab-tests')
export class ABTestingController {
  constructor(private abTestingService: ABTestingService) {}

  @Get()
  findAll(@Query('projectId') projectId: string) {
    return this.abTestingService.findAll(projectId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.abTestingService.findOne(id);
  }

  @Post()
  create(@Body() dto: any) {
    return this.abTestingService.create(dto);
  }

  @Put(':id/start')
  startTest(@Param('id') id: string) {
    return this.abTestingService.startTest(id);
  }

  @Put(':id/pause')
  pauseTest(@Param('id') id: string) {
    return this.abTestingService.pauseTest(id);
  }

  @Put(':id/complete')
  completeTest(@Param('id') id: string, @Body() dto: { winnerVariantId?: string }) {
    return this.abTestingService.completeTest(id, dto.winnerVariantId);
  }

  @Get(':id/results')
  getResults(@Param('id') id: string) {
    return this.abTestingService.getResults(id);
  }

  @Get(':id/variant')
  getVariantForSession(@Param('id') id: string, @Query('sessionId') sessionId: string) {
    return this.abTestingService.getVariantForSession(id, sessionId);
  }

  @Post('variants/:variantId/impression')
  recordImpression(@Param('variantId') variantId: string) {
    return this.abTestingService.recordImpression(variantId);
  }

  @Post('variants/:variantId/conversion')
  recordConversion(@Param('variantId') variantId: string) {
    return this.abTestingService.recordConversion(variantId);
  }

  @Post('variants/:variantId/click')
  recordClick(@Param('variantId') variantId: string) {
    return this.abTestingService.recordClick(variantId);
  }

  @Delete(':id')
  deleteTest(@Param('id') id: string) {
    return this.abTestingService.deleteTest(id);
  }
}
