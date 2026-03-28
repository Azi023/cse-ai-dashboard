import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

/**
 * API key guard for sensitive endpoints.
 *
 * Requires X-API-Key header matching the API_SECRET_KEY env variable.
 * Apply to any controller or route that should NOT be publicly accessible:
 *   - Trade execution
 *   - ATrad sync (broker login)
 *   - Admin / backfill operations
 *   - Notification triggers
 *
 * Public endpoints (market data, signals, stocks) do NOT use this guard.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = request.headers['x-api-key'];
    const secret = this.configService.get<string>('API_SECRET_KEY');

    if (!secret) {
      throw new UnauthorizedException(
        'API_SECRET_KEY is not configured. Set it in .env to access protected endpoints.',
      );
    }

    if (!apiKey || apiKey !== secret) {
      throw new UnauthorizedException('Invalid or missing X-API-Key header.');
    }

    return true;
  }
}
