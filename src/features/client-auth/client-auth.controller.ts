import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ClientAuthService } from './client-auth.service';
import { ClientSessionsService } from './client-sessions.service';
import { LoginDto } from './dto/login.dto';
import { Public } from '@shared/decorators/public.decorator';
import { ClientAuth } from '@shared/decorators/client-auth.decorator';
import { CurrentClientUser } from '@shared/decorators/current-client-user.decorator';
import { ClientUserPrincipal } from '@shared/types/express';
import {
  CLIENT_SESSION_COOKIE_NAME,
  getClientSessionCookieOptions,
} from './client-session-cookie-options';
import { User } from '@persistence/schemas/user.schema';

interface ClientUserResponseDto {
  id: string;
  email: string;
  name: string;
  clientId: string;
  status: 'active' | 'inactive' | 'archived';
  lastLoginAt: string | null;
}

@Controller('client-auth')
export class ClientAuthController {
  constructor(
    private readonly clientAuthService: ClientAuthService,
    private readonly clientSessionsService: ClientSessionsService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ user: ClientUserResponseDto }> {
    const result = await this.clientAuthService.login({
      email: dto.email,
      password: dto.password,
      userAgent: this.readUserAgent(request),
      ip: request.ip ?? null,
    });

    response.cookie(CLIENT_SESSION_COOKIE_NAME, result.rawToken, {
      ...getClientSessionCookieOptions(),
      maxAge: this.clientSessionsService.getAbsoluteTtlMs(),
    });

    return { user: this.toClientUserResponse(result.user) };
  }

  @ClientAuth()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentClientUser() principal: ClientUserPrincipal | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    if (principal !== undefined) {
      await this.clientAuthService.logout(principal.sessionId);
    }
    this.clearSessionCookie(response);
  }

  @ClientAuth()
  @Get('me')
  async me(
    @CurrentClientUser() principal: ClientUserPrincipal | undefined,
  ): Promise<{ user: ClientUserResponseDto }> {
    if (principal === undefined) {
      throw new UnauthorizedException('Authentication required');
    }
    const fresh = await this.clientAuthService.getMe(principal.userId);
    if (fresh === null || fresh.status !== 'active') {
      throw new UnauthorizedException('Authentication required');
    }
    return { user: this.toClientUserResponse(fresh) };
  }

  private clearSessionCookie(response: Response): void {
    const options = getClientSessionCookieOptions();
    response.clearCookie(CLIENT_SESSION_COOKIE_NAME, options);
    // Defense in depth: some browsers ignore clearCookie() unless the
    // outgoing Set-Cookie also carries an explicit expiry in the past.
    response.cookie(CLIENT_SESSION_COOKIE_NAME, '', {
      ...options,
      expires: new Date(0),
      maxAge: 0,
    });
  }

  private readUserAgent(request: Request): string | null {
    const header = request.headers['user-agent'];
    if (typeof header !== 'string' || header.length === 0) {
      return null;
    }
    return header;
  }

  private toClientUserResponse(user: User): ClientUserResponseDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      clientId: user.clientId.toString(),
      status: user.status,
      lastLoginAt:
        user.lastLoginAt === null || user.lastLoginAt === undefined
          ? null
          : user.lastLoginAt.toISOString(),
    };
  }
}
