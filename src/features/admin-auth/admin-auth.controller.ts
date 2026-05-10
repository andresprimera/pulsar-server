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
import { AdminAuthService } from './admin-auth.service';
import { AdminSessionsService } from './admin-sessions.service';
import { LoginDto } from './dto/login.dto';
import { Public } from '@shared/decorators/public.decorator';
import { CurrentAdmin } from '@shared/decorators/current-admin.decorator';
import { AdminPrincipal } from '@shared/types/express';
import { AdminPrincipalDto, AuthEnvelopeDto } from '@shared/auth/principal.dto';
import {
  ADMIN_SESSION_COOKIE_NAME,
  getSessionCookieOptions,
} from './session-cookie-options';

@Controller('admin-auth')
export class AdminAuthController {
  constructor(
    private readonly adminAuthService: AdminAuthService,
    private readonly adminSessionsService: AdminSessionsService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthEnvelopeDto<AdminPrincipalDto>> {
    const result = await this.adminAuthService.login({
      email: dto.email,
      password: dto.password,
      userAgent: this.readUserAgent(request),
      ip: request.ip ?? null,
    });

    response.cookie(ADMIN_SESSION_COOKIE_NAME, result.rawToken, {
      ...getSessionCookieOptions(),
      maxAge: this.adminSessionsService.getAbsoluteTtlMs(),
    });

    return { principal: this.toAdminPrincipal(result.admin) };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentAdmin() admin: AdminPrincipal | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    if (admin !== undefined) {
      await this.adminAuthService.logout(admin.sessionId);
    }
    this.clearSessionCookie(response);
  }

  @Get('me')
  async me(
    @CurrentAdmin() admin: AdminPrincipal | undefined,
  ): Promise<AuthEnvelopeDto<AdminPrincipalDto>> {
    if (admin === undefined) {
      throw new UnauthorizedException('Authentication required');
    }
    const fresh = await this.adminAuthService.getMe(admin.adminUserId);
    if (fresh === null) {
      throw new UnauthorizedException('Authentication required');
    }
    return { principal: this.toAdminPrincipal(fresh) };
  }

  private clearSessionCookie(response: Response): void {
    const options = getSessionCookieOptions();
    response.clearCookie(ADMIN_SESSION_COOKIE_NAME, options);
    // Defense in depth: some browsers ignore clearCookie() unless the
    // outgoing Set-Cookie also carries an explicit expiry in the past.
    response.cookie(ADMIN_SESSION_COOKIE_NAME, '', {
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

  private toAdminPrincipal(
    admin: import('@persistence/schemas/admin-user.schema').AdminUser,
  ): AdminPrincipalDto {
    return {
      kind: 'admin',
      id: admin.id,
      email: admin.email,
      displayName: admin.displayName,
      status: admin.status,
      role: admin.role,
      lastLoginAt:
        admin.lastLoginAt === null || admin.lastLoginAt === undefined
          ? null
          : admin.lastLoginAt.toISOString(),
    };
  }
}
