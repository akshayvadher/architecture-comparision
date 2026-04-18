import { Module, type Provider } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import type { Env } from '../config/env.schema';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';

const jwtStrategyProvider: Provider = {
  provide: JwtStrategy,
  useFactory: (config: ConfigService<Env, true>) => {
    const issuer = config.get('OIDC_ISSUER', { infer: true });
    const audience = config.get('OIDC_AUDIENCE', { infer: true });
    if (!issuer || !audience) {
      return null;
    }
    return new JwtStrategy(config);
  },
  inject: [ConfigService],
};

@Module({
  imports: [ConfigModule, PassportModule],
  providers: [
    jwtStrategyProvider,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AuthModule {}
