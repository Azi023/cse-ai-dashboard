import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

/**
 * Agent key guard for internal agent API endpoints.
 *
 * Requires X-Agent-Key header matching the AGENT_SECRET env variable.
 * Used exclusively by the WSL2 execution agent for:
 *   - Heartbeat checks
 *   - Pending trade retrieval
 *   - Execution reporting
 *   - Portfolio sync push
 *   - Sync trigger polling
 */
@Injectable()
export class AgentKeyGuard implements CanActivate {
  private readonly logger = new Logger(AgentKeyGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const agentKey = request.headers['x-agent-key'];
    const secret = this.configService.get<string>('AGENT_SECRET');

    if (!secret) {
      throw new UnauthorizedException(
        'AGENT_SECRET is not configured. Set it in .env to enable agent API.',
      );
    }

    if (!agentKey || agentKey !== secret) {
      this.logger.warn(
        `Unauthorized agent API request from ${request.ip} — ${request.method} ${request.path}`,
      );
      throw new UnauthorizedException('Invalid or missing X-Agent-Key header.');
    }

    this.logger.debug(
      `Agent API: ${request.method} ${request.path} from ${request.ip}`,
    );
    return true;
  }
}
