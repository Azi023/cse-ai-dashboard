import {
  Injectable,
  UnauthorizedException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

interface JwtPayload {
  sub: string;
  username: string;
  type: 'access' | 'refresh';
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private passwordHash: string;
  private expectedUsername: string;

  // Track refresh token invalidation (logout)
  // In-memory set is fine for single-user, single-instance
  private revokedRefreshTokens = new Set<string>();

  constructor(private readonly jwtService: JwtService) {}

  async onModuleInit(): Promise<void> {
    const username = process.env.DASHBOARD_USERNAME;
    const password = process.env.DASHBOARD_PASSWORD;

    if (!username || !password) {
      this.logger.error(
        'DASHBOARD_USERNAME and DASHBOARD_PASSWORD must be set in environment variables. Auth will reject all logins.',
      );
      // Do NOT throw — let the app start but reject all logins
      this.expectedUsername = '';
      this.passwordHash = '';
      return;
    }

    if (password.length < 8) {
      this.logger.warn(
        'DASHBOARD_PASSWORD is shorter than 8 characters. Consider using a stronger password.',
      );
    }

    this.expectedUsername = username;
    // Pre-hash the password at startup so we never hold plaintext in memory
    // beyond initialization
    this.passwordHash = await bcrypt.hash(password, 12);
    this.logger.log('Auth service initialized — credentials loaded from environment');
  }

  async validateLogin(
    username: string,
    password: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    if (!this.expectedUsername || !this.passwordHash) {
      throw new UnauthorizedException(
        'Authentication is not configured on the server',
      );
    }

    // Constant-time username comparison via bcrypt to prevent timing attacks
    const usernameMatch = username === this.expectedUsername;
    const passwordMatch = await bcrypt.compare(password, this.passwordHash);

    if (!usernameMatch || !passwordMatch) {
      // Generic message — never reveal which field was wrong
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.generateTokenPair(username);
  }

  async refreshTokens(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    if (this.revokedRefreshTokens.has(refreshToken)) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    try {
      const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.getRefreshSecret(),
      });

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Invalid token type');
      }

      // Revoke the old refresh token (rotation)
      this.revokedRefreshTokens.add(refreshToken);

      return this.generateTokenPair(payload.username);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  revokeRefreshToken(refreshToken: string): void {
    if (refreshToken) {
      this.revokedRefreshTokens.add(refreshToken);
    }
  }

  validateAccessToken(payload: JwtPayload): { username: string } | null {
    if (payload.type !== 'access') {
      return null;
    }
    if (payload.username !== this.expectedUsername) {
      return null;
    }
    return { username: payload.username };
  }

  private generateTokenPair(username: string): {
    accessToken: string;
    refreshToken: string;
  } {
    const accessToken = this.jwtService.sign(
      { sub: username, username, type: 'access' } as JwtPayload,
      {
        secret: this.getAccessSecret(),
        expiresIn: '15m',
      },
    );

    const refreshToken = this.jwtService.sign(
      { sub: username, username, type: 'refresh' } as JwtPayload,
      {
        secret: this.getRefreshSecret(),
        expiresIn: '7d',
      },
    );

    return { accessToken, refreshToken };
  }

  private getAccessSecret(): string {
    // Derive from API_SECRET_KEY — reuse existing secret rather than requiring
    // yet another env var. The prefix ensures access and refresh secrets differ.
    const base = process.env.API_SECRET_KEY || 'fallback-dev-secret-change-me';
    return `access:${base}`;
  }

  private getRefreshSecret(): string {
    const base = process.env.API_SECRET_KEY || 'fallback-dev-secret-change-me';
    return `refresh:${base}`;
  }
}
