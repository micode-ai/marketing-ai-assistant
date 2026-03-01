import { Controller, Get, Post, Param, Query, Body, Res, Req, UsePipes } from '@nestjs/common';
import { ApiTags, ApiExcludeEndpoint } from '@nestjs/swagger';
import { Response, Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { TrackingService } from './tracking.service';

const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

@ApiTags('tracking')
@Controller('t')
@Public()
export class TrackingController {
  constructor(private trackingService: TrackingService) {}

  @Post('event')
  @ApiExcludeEndpoint()
  @UsePipes()
  trackEvent(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    this.trackingService.queueWebEvent({
      ...body,
      ip: req.ip || req.headers['x-forwarded-for'],
      ua: body.ua || req.headers['user-agent'],
    });
    res.status(204).send();
  }

  @Get('pixel.gif')
  @ApiExcludeEndpoint()
  pixel(@Query('tid') tid: string, @Query('url') url: string, @Req() req: Request, @Res() res: Response) {
    if (tid) {
      this.trackingService.queueWebEvent({
        tid,
        type: 'page_view',
        url: url || '',
        referrer: (req.headers['referer'] as string) || '',
        ua: (req.headers['user-agent'] as string) || '',
        ip: req.ip || req.headers['x-forwarded-for'],
      });
    }
    res.set({
      'Content-Type': 'image/gif',
      'Content-Length': String(TRANSPARENT_GIF.length),
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      Pragma: 'no-cache',
    });
    res.end(TRANSPARENT_GIF);
  }

  @Get('o/:trackingId')
  @ApiExcludeEndpoint()
  emailOpen(@Param('trackingId') trackingId: string, @Req() req: Request, @Res() res: Response) {
    this.trackingService.queueEmailOpen(trackingId, {
      ip: req.ip || req.headers['x-forwarded-for'],
      ua: (req.headers['user-agent'] as string) || '',
    });
    res.set({
      'Content-Type': 'image/gif',
      'Content-Length': String(TRANSPARENT_GIF.length),
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    });
    res.end(TRANSPARENT_GIF);
  }

  @Get('c/:trackingId')
  @ApiExcludeEndpoint()
  emailClick(@Param('trackingId') trackingId: string, @Req() req: Request, @Res() res: Response) {
    const data = this.trackingService.decodeTrackingId(trackingId);
    if (!data || !data.url) {
      res.status(400).send('Invalid tracking link');
      return;
    }
    this.trackingService.queueEmailClick(trackingId, {
      ip: req.ip || req.headers['x-forwarded-for'],
      ua: (req.headers['user-agent'] as string) || '',
    });
    res.redirect(302, data.url);
  }

  @Get('snippet/:trackingId')
  @ApiExcludeEndpoint()
  getSnippet(@Param('trackingId') trackingId: string, @Res() res: Response) {
    const snippet = this.trackingService.generateSnippet(trackingId);
    res.set('Content-Type', 'text/javascript');
    res.send(snippet);
  }
}
