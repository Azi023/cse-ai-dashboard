import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Mark a route or controller as public — bypasses JWT auth guard.
 * Use sparingly: only for /auth/login, /auth/refresh, /health, and
 * endpoints that genuinely need to be unauthenticated.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
