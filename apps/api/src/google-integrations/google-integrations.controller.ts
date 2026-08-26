import { Controller, Get, Post, Delete, Body, Query, Res, BadRequestException, HttpException, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { GoogleIntegrationsService } from './google-integrations.service';
import { Public } from '../common/decorators/public.decorator';
import { ProjectAccessGuard } from '../common/guards/project-access.guard';
import { GscFilter } from './gsc-query.util';

@ApiTags('google')
@ApiBearerAuth()
@Controller('google')
export class GoogleIntegrationsController {
  constructor(
    private googleService: GoogleIntegrationsService,
    private config: ConfigService,
  ) {}

  @Get('auth-url')
  getAuthUrl(@Query('projectId') projectId: string) {
    const apiUrl = this.config.get('API_URL') || 'http://localhost:3000';
    const redirectUri = `${apiUrl}/api/google/callback`;
    return { url: this.googleService.getAuthUrl(redirectUri, projectId) };
  }

  @Get('callback')
  @Public()
  async callback(
    @Query('code') code: string,
    @Query('state') projectId: string,
    @Res() res: Response,
  ) {
    const apiUrl = this.config.get('API_URL') || 'http://localhost:3000';
    const webUrl = this.config.get('WEB_URL') || 'http://localhost:5173';
    const redirectUri = `${apiUrl}/api/google/callback`;

    try {
      const tokens = await this.googleService.exchangeCode(code, redirectUri);

      await this.googleService.saveIntegration(projectId, 'gsc', {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      });

      res.redirect(`${webUrl}/projects/${projectId}/analytics?google=connected`);
    } catch {
      res.redirect(`${webUrl}/projects/${projectId}/analytics?google=error`);
    }
  }

  @Get('integration')
  @ApiOperation({ summary: 'Google integration status — never the tokens' })
  getIntegration(@Query('projectId') projectId: string) {
    return this.googleService.getIntegrationView(projectId);
  }

  @Get('gsc/sites')
  async listGscSites(@Query('projectId') projectId: string) {
    const config = await this.googleService.getIntegration(projectId);
    if (!config?.accessToken) return { sites: [] };

    let accessToken = config.accessToken as string;
    if (new Date(config.expiresAt as string) < new Date() && config.refreshToken) {
      accessToken = await this.googleService.refreshAccessToken(config.refreshToken as string);
      await this.googleService.saveIntegration(projectId, 'gsc', {
        ...config,
        accessToken,
        expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      });
    }

    const sites = await this.googleService.listSearchConsoleSites(accessToken);
    return { sites };
  }

  @Delete('integration')
  deleteIntegration(@Query('projectId') projectId: string) {
    return this.googleService.deleteIntegration(projectId);
  }

  @Get('search-console')
  async getSearchConsoleData(
    @Query('projectId') projectId: string,
    @Query('siteUrl') siteUrl: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('dimensions') dimensions?: string,
  ) {
    const config = await this.googleService.getIntegration(projectId);
    if (!config?.accessToken) return { error: 'Not connected', data: [] };

    let accessToken = config.accessToken as string;
    if (new Date(config.expiresAt as string) < new Date() && config.refreshToken) {
      accessToken = await this.googleService.refreshAccessToken(config.refreshToken as string);
      await this.googleService.saveIntegration(projectId, 'gsc', {
        ...config,
        accessToken,
        expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      });
    }

    const dims = dimensions?.split(',') || ['query'];
    const data = await this.googleService.fetchSearchConsoleData(
      accessToken, siteUrl, startDate, endDate, dims,
    );
    return { data };
  }

  @Get('analytics')
  async getGA4Data(
    @Query('projectId') projectId: string,
    @Query('propertyId') propertyId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('dimensions') dimensions?: string,
    @Query('metrics') metrics?: string,
  ) {
    const config = await this.googleService.getIntegration(projectId);
    if (!config?.accessToken) return { error: 'Not connected', data: [] };

    let accessToken = config.accessToken as string;
    if (new Date(config.expiresAt as string) < new Date() && config.refreshToken) {
      accessToken = await this.googleService.refreshAccessToken(config.refreshToken as string);
      await this.googleService.saveIntegration(projectId, 'ga4', {
        ...config,
        accessToken,
        expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      });
    }

    const dims = dimensions?.split(',') || ['date'];
    const mets = metrics?.split(',') || ['sessions', 'totalUsers', 'screenPageViews'];
    const data = await this.googleService.fetchGA4Report(
      accessToken, propertyId, startDate, endDate, dims, mets,
    );
    return { data };
  }

  @Post('config')
  async saveConfig(
    @Body() dto: { projectId: string; type: 'gsc' | 'ga4'; siteUrl?: string; propertyId?: string },
  ) {
    const existing = await this.googleService.getIntegration(dto.projectId);
    return this.googleService.saveIntegration(dto.projectId, dto.type, {
      ...existing,
      siteUrl: dto.siteUrl,
      propertyId: dto.propertyId,
    });
  }

  @Get('search-console/summary')
  @UseGuards(ProjectAccessGuard)
  async getSearchConsoleSummary(
    @Query('projectId') projectId: string,
    @Query('days') daysParam?: string,
  ) {
    if (!projectId) throw new BadRequestException('projectId is required');

    const days = Math.min(90, Math.max(7, parseInt(daysParam || '28', 10) || 28));

    try {
      return await this.googleService.fetchSearchConsoleSummary(projectId, days);
    } catch (err: any) {
      if (err?.code === 'GSC_NOT_CONFIGURED') {
        throw new HttpException({ code: 'GSC_NOT_CONFIGURED' }, HttpStatus.BAD_REQUEST);
      }
      const message = err instanceof Error ? err.message : 'Unknown GSC error';
      throw new HttpException({ code: 'GSC_ERROR', message }, HttpStatus.BAD_GATEWAY);
    }
  }

  private parseGscParams(daysParam?: string, type?: string, filtersParam?: string) {
    const days = Math.min(90, Math.max(7, parseInt(daysParam || '28', 10) || 28));
    const allowedTypes = ['web', 'image', 'video', 'news', 'discover'];
    const searchType = allowedTypes.includes(type || '') ? type : 'web';
    let filters: GscFilter[] = [];
    if (filtersParam) {
      try {
        const parsed = JSON.parse(filtersParam);
        if (Array.isArray(parsed)) filters = parsed;
      } catch {
        // ignore malformed filters -> no filtering
      }
    }
    return { days, type: searchType, filters };
  }

  @Get('search-console/query')
  @UseGuards(ProjectAccessGuard)
  async getSearchConsoleQuery(
    @Query('projectId') projectId: string,
    @Query('days') daysParam?: string,
    @Query('dimensions') dimensionsParam?: string,
    @Query('type') typeParam?: string,
    @Query('filters') filtersParam?: string,
    @Query('rowLimit') rowLimitParam?: string,
    @Query('startRow') startRowParam?: string,
    @Query('compare') compareParam?: string,
  ) {
    if (!projectId) throw new BadRequestException('projectId is required');
    const { days, type, filters } = this.parseGscParams(daysParam, typeParam, filtersParam);
    const dimensions = dimensionsParam === undefined
      ? ['query']
      : dimensionsParam.split(',').filter(Boolean);
    const rowLimit = Math.min(5000, Math.max(1, parseInt(rowLimitParam || '100', 10) || 100));
    const startRow = Math.max(0, parseInt(startRowParam || '0', 10) || 0);
    try {
      return await this.googleService.fetchSearchConsoleQuery(projectId, {
        days, dimensions, type, filters, rowLimit, startRow, compare: compareParam === 'true',
      });
    } catch (err: any) {
      if (err?.code === 'GSC_NOT_CONFIGURED') {
        throw new HttpException({ code: 'GSC_NOT_CONFIGURED' }, HttpStatus.BAD_REQUEST);
      }
      throw new HttpException({ code: 'GSC_ERROR', message: err instanceof Error ? err.message : 'Unknown GSC error' }, HttpStatus.BAD_GATEWAY);
    }
  }

  @Get('search-console/insights')
  @UseGuards(ProjectAccessGuard)
  async getSearchConsoleInsights(
    @Query('projectId') projectId: string,
    @Query('days') daysParam?: string,
    @Query('type') typeParam?: string,
    @Query('filters') filtersParam?: string,
  ) {
    if (!projectId) throw new BadRequestException('projectId is required');
    const { days, type, filters } = this.parseGscParams(daysParam, typeParam, filtersParam);
    try {
      return await this.googleService.computeGscInsights(projectId, { days, type, filters });
    } catch (err: any) {
      if (err?.code === 'GSC_NOT_CONFIGURED') {
        throw new HttpException({ code: 'GSC_NOT_CONFIGURED' }, HttpStatus.BAD_REQUEST);
      }
      throw new HttpException({ code: 'GSC_ERROR', message: err instanceof Error ? err.message : 'Unknown GSC error' }, HttpStatus.BAD_GATEWAY);
    }
  }

  @Post('search-console/advice')
  @UseGuards(ProjectAccessGuard)
  async getSeoAdvice(
    @Query('projectId') projectId: string,
    @Body() dto: { days?: number; type?: string; filters?: GscFilter[]; language?: string },
  ) {
    if (!projectId) throw new BadRequestException('projectId is required');
    const days = Math.min(90, Math.max(7, Number(dto?.days) || 28));
    const allowedTypes = ['web', 'image', 'video', 'news', 'discover'];
    const type = allowedTypes.includes(dto?.type || '') ? dto!.type : 'web';
    const filters = Array.isArray(dto?.filters) ? dto!.filters : [];
    const language = (dto?.language || 'en').slice(0, 8);
    try {
      return await this.googleService.generateSeoAdvice(projectId, { days, type, filters, language });
    } catch (err: any) {
      if (err?.code === 'GSC_NOT_CONFIGURED') {
        throw new HttpException({ code: 'GSC_NOT_CONFIGURED' }, HttpStatus.BAD_REQUEST);
      }
      throw new HttpException({ code: 'GSC_ERROR', message: err instanceof Error ? err.message : 'Unknown GSC error' }, HttpStatus.BAD_GATEWAY);
    }
  }
}
