import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { EmailSequencesService } from './email-sequences.service';

@ApiTags('email-sequences')
@ApiBearerAuth()
@Controller('email-sequences')
export class EmailSequencesController {
  constructor(private emailSequencesService: EmailSequencesService) {}

  @Get()
  findAll(@Query('projectId') projectId: string) {
    return this.emailSequencesService.findAll(projectId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.emailSequencesService.findOne(id);
  }

  @Post()
  create(@Body() dto: any) {
    return this.emailSequencesService.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: any) {
    return this.emailSequencesService.update(id, dto);
  }

  @Put(':id/activate')
  activate(@Param('id') id: string) {
    return this.emailSequencesService.activate(id);
  }

  @Put(':id/pause')
  pause(@Param('id') id: string) {
    return this.emailSequencesService.pause(id);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.emailSequencesService.delete(id);
  }

  @Post(':id/enroll')
  enrollSubscriber(@Param('id') id: string, @Body() dto: { subscriberId: string }) {
    return this.emailSequencesService.enrollSubscriber(id, dto.subscriberId);
  }

  @Post(':id/unenroll')
  unenrollSubscriber(@Param('id') id: string, @Body() dto: { subscriberId: string }) {
    return this.emailSequencesService.unenrollSubscriber(id, dto.subscriberId);
  }

  @Get(':id/enrollments')
  getEnrollments(@Param('id') id: string) {
    return this.emailSequencesService.getEnrollments(id);
  }
}
