import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Req,
  Res,
  HttpCode,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { MagicLinkRequestDto } from './dto/magic-link-request.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import type { NexusJwtPayload } from './jwt.service';

@Controller('auth')
@ApiTags('Authentication')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('magic-link')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { ttl: 3600000, limit: 5 } })
  @ApiOperation({ summary: 'Request a magic link login email' })
  @ApiResponse({ status: 200, description: 'Magic link email sent (if registered)' })
  async sendMagicLink(
    @Body() dto: MagicLinkRequestDto,
  ): Promise<AuthResponseDto> {
    await this.authService.sendMagicLink(dto.email);
    return {
      message: 'Se o email estiver cadastrado, voce recebera o link.',
    };
  }

  @Get('callback')
  @Public()
  @ApiOperation({ summary: 'Validate magic link token and set auth cookies' })
  @ApiResponse({ status: 200, description: 'JSON with tokens (SPA fetch)' })
  @ApiResponse({ status: 302, description: 'Redirect to dashboard (browser navigation)' })
  @ApiResponse({ status: 401, description: 'Invalid or expired token' })
  async callback(
    @Query('token') token: string,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    if (!token) {
      throw new UnauthorizedException('Token ausente');
    }

    const { accessToken, refreshToken } =
      await this.authService.validateMagicLink(token);

    const cookieOpts = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
    };

    reply
      .setCookie('access_token', accessToken, {
        ...cookieOpts,
        maxAge: 900, // 15 min
      })
      .setCookie('refresh_token', refreshToken, {
        ...cookieOpts,
        path: '/api/v1/auth',
        maxAge: 2592000, // 30 days
      });

    // SPA fetch: return JSON; browser navigation: redirect
    const isFetch = request.headers.accept?.includes('application/json') ||
      request.headers.origin != null;

    if (isFetch) {
      reply.send({ accessToken });
    } else {
      const redirectUrl =
        process.env.MAGIC_LINK_BASE_URL?.replace('/auth/callback', '/dashboard') ??
        '/';
      reply.redirect(302, redirectUrl);
    }
  }

  @Post('refresh')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Refresh access token using refresh token cookie' })
  @ApiResponse({ status: 200, description: 'New access token set in cookie' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refresh(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const cookies = (request as unknown as { cookies: Record<string, string> }).cookies;
    const refreshToken = cookies?.refresh_token;

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token ausente');
    }

    const { accessToken, refreshToken: newRefreshToken } =
      await this.authService.refresh(refreshToken);

    reply
      .setCookie('access_token', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 900,
      })
      .setCookie('refresh_token', newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/api/v1/auth',
        maxAge: 2592000, // 30 days
      })
      .send({ accessToken, message: 'Token renovado' });
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Logout — blacklist current token' })
  @ApiResponse({ status: 200, description: 'Logout successful' })
  async logout(
    @CurrentUser() user: NexusJwtPayload,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    await this.authService.logout(user.jti!, user.exp!);

    reply
      .clearCookie('access_token', { path: '/' })
      .clearCookie('refresh_token', { path: '/api/v1/auth' })
      .send({ message: 'Logout realizado' });
  }
}
