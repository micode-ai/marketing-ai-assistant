import { Controller, Get, Post, Delete, Body, Query, Res } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { GoogleIntegrationsService } from './google-integrations.service';

@ApiTags('google')
@ApiBearerAuth()
@Controller('google')
export class GoogleIntegrationsController {
  constructor(
    private googleService: GoogleIntegrationsService,
    private config: ConfigService,
  ) {}

  @Get('auth')
  authorize(@Query('projectId') projectId: string, @Res() res: Response) {
    const apiUrl = this.config.get('API_URL') || 'http://localhost:3000';
    const redirectUri = `${apiUrl}/api/google/callback`;
    const url = this.googleService.getAuthUrl(redirectUri, projectId);
    res.redirect(url);
  }

  @Get('callback')
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
  getIntegration(@Query('projectId') projectId: string) {
    return this.googleService.getIntegration(projectId);
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
}
