import { type ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Env } from '../../../../infrastructure/config/env.schema';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService<Env, true>,
  ) {
    super();
  }

  canActivate(context: ExecutionContext) {
    if (this.isUnauthenticatedEndpoint(context)) {
      return true;
    }
    if (this.isPublic(context)) {
      return true;
    }
    if (this.isDevModeBypass()) {
      return true;
    }
    return super.canActivate(context);
  }

  private isUnauthenticatedEndpoint(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ url?: string }>();
    const url = req.url ?? '';
    return (
      url === '/metrics' ||
      url.startsWith('/metrics?') ||
      url === '/docs' ||
      url.startsWith('/docs/') ||
      url.startsWith('/docs?') ||
      url === '/docs-json' ||
      url.startsWith('/docs-json?')
    );
  }

  private isPublic(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) === true
    );
  }

  private isDevModeBypass(): boolean {
    const nodeEnv = this.config.get('NODE_ENV', { infer: true });
    if (nodeEnv === 'production') {
      return false;
    }
    const issuer = this.config.get('OIDC_ISSUER', { infer: true });
    const audience = this.config.get('OIDC_AUDIENCE', { infer: true });
    return !issuer || !audience;
  }
}
