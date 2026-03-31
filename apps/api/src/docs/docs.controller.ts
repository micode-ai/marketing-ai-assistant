import {
  Controller,
  Get,
  Param,
  Query,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { DocsService } from './docs.service';

@ApiTags('help')
@Controller('help')
export class DocsController {
  constructor(private docsService: DocsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List all documentation articles' })
  list(@Query('lang') lang = 'en') {
    return this.docsService.getDocsList(lang);
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Get documentation article by slug' })
  getOne(@Param('slug') slug: string, @Query('lang') lang = 'en') {
    const doc = this.docsService.getDoc(slug, lang);
    if (!doc) throw new NotFoundException('Article not found');
    return doc;
  }
}
