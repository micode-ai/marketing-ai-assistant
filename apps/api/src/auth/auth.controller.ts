import { Controller, Post, Get, Body, UseGuards, Req, Res } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register new user' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @UseGuards(AuthGuard('local'))
  @Post('login')
  @ApiOperation({ summary: 'Login with email/password' })
  login(@CurrentUser() user: any) {
    return this.authService.login(user);
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token' })
  refresh(@Body('refreshToken') refreshToken: string) {
    return this.authService.refreshToken(refreshToken);
  }

  @Public()
  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Login with Google OAuth' })
  googleAuth() {}

  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@CurrentUser() user: any, @Res() res: any) {
    const tokens = await this.authService.googleLogin(user);
    const webUrl = process.env.WEB_URL || 'http://localhost:5173';
    res.redirect(`${webUrl}/auth/callback?token=${tokens.accessToken}&refresh=${tokens.refreshToken}`);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current user' })
  getMe(@CurrentUser() user: any) {
    return user;
  }
}
