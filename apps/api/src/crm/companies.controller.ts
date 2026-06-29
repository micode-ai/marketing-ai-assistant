import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto, UpdateCompanyDto } from './dto/company.dto';

@ApiTags('crm')
@ApiBearerAuth()
@Controller('crm/companies')
@UseGuards(ProjectAccessGuard)
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Get()
  list(@Query('projectId') projectId: string, @Query('search') search?: string) {
    return this.companies.list(projectId, { search });
  }

  @Get(':id')
  get(@Query('projectId') projectId: string, @Param('id') id: string) {
    return this.companies.get(projectId, id);
  }

  @Post()
  create(@Query('projectId') projectId: string, @Body() dto: CreateCompanyDto) {
    return this.companies.create(projectId, dto);
  }

  @Patch(':id')
  update(
    @Query('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCompanyDto,
  ) {
    return this.companies.update(projectId, id, dto);
  }

  @Delete(':id')
  remove(@Query('projectId') projectId: string, @Param('id') id: string) {
    return this.companies.remove(projectId, id);
  }
}
