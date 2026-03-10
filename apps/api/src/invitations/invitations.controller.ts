import { Controller, Get, Post, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InvitationsService } from './invitations.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('invitations')
@ApiBearerAuth()
@Controller('invitations')
export class InvitationsController {
  constructor(private invitationsService: InvitationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get pending invitations for current user' })
  getPending(@CurrentUser() user: any) {
    return this.invitationsService.getPending(user.id);
  }

  @Post(':id/accept')
  @ApiOperation({ summary: 'Accept an invitation' })
  accept(@Param('id') id: string, @CurrentUser() user: any) {
    return this.invitationsService.accept(id, user.id);
  }

  @Post(':id/decline')
  @ApiOperation({ summary: 'Decline an invitation' })
  decline(@Param('id') id: string, @CurrentUser() user: any) {
    return this.invitationsService.decline(id, user.id);
  }
}
