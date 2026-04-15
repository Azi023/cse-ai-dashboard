import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { Request } from 'express';
import { AuthService } from './auth.service';

/**
 * Extract JWT from httpOnly cookie first, fall back to Authorization header.
 * Cookie-based extraction is preferred for browser sessions.
 * Header extraction supports programmatic API access (cron, scripts).
 */
function extractJwtFromCookieOrHeader(req: Request): string | null {
  // 1. Try httpOnly cookie
  if (req.cookies && req.cookies.access_token) {
    return req.cookies.access_token;
  }

  // 2. Fall back to Bearer token in Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly authService: AuthService) {
    // MUST match auth.service.ts::getAccessSecret — any divergence produces
    // silent 401s on every JWT-guarded endpoint.
    const base = process.env.API_SECRET_KEY || 'fallback-dev-secret-change-me';

    super({
      jwtFromRequest: extractJwtFromCookieOrHeader,
      ignoreExpiration: false,
      secretOrKey: `access:${base}`,
    });
  }

  validate(payload: { sub: string; username: string; type: string }): {
    username: string;
  } {
    const user = this.authService.validateAccessToken(payload as any);
    if (!user) {
      throw new UnauthorizedException('Invalid token');
    }
    return user;
  }
}
