import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { passportJwtSecret } from 'jwks-rsa';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Env } from '../config/env.schema';

function resolveJwksUri(issuer: string, explicit: string | undefined) {
  if (explicit) {
    return explicit;
  }
  return `${issuer.replace(/\/$/, '')}/.well-known/jwks.json`;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService<Env, true>) {
    const issuer = config.get('OIDC_ISSUER', { infer: true });
    const audience = config.get('OIDC_AUDIENCE', { infer: true });
    const jwksUri = issuer
      ? resolveJwksUri(issuer, config.get('OIDC_JWKS_URI', { infer: true }))
      : undefined;

    if (!issuer || !audience || !jwksUri) {
      throw new Error(
        'JwtStrategy requires OIDC_ISSUER and OIDC_AUDIENCE to be configured',
      );
    }

    super({
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksUri,
      }),
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      issuer,
      audience,
      algorithms: ['RS256'],
    });
  }

  async validate(payload: Record<string, unknown>) {
    return payload;
  }
}
