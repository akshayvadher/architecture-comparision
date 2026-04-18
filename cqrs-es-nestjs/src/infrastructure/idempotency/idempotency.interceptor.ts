import { createHash } from 'node:crypto';
import {
  type CallHandler,
  ConflictException,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { from, type Observable, of, switchMap } from 'rxjs';
import { DRIZZLE, type DrizzleDB } from '../persistence/database';
import { idempotencyKeys } from '../persistence/schema';

type HttpRequest = {
  method: string;
  route?: { path: string };
  url: string;
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
};

type HttpResponse = {
  statusCode: number;
};

const DEFAULT_CREATED_STATUS = 201;

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<HttpRequest>();
    const res = context.switchToHttp().getResponse<HttpResponse>();

    if (req.method !== 'POST') {
      return next.handle();
    }

    const key = extractIdempotencyKey(req.headers);
    if (!key) {
      return next.handle();
    }

    const endpoint = req.route?.path ?? req.url;
    const requestHash = sha256Json(req.body);

    return from(this.findExisting(key, endpoint)).pipe(
      switchMap((existing) => {
        if (existing) {
          return this.replayCachedResponse(existing, requestHash, res);
        }
        return this.executeAndCache(next, key, endpoint, requestHash, res);
      }),
    );
  }

  private async findExisting(
    key: string,
    endpoint: string,
  ): Promise<typeof idempotencyKeys.$inferSelect | undefined> {
    const rows = await this.db
      .select()
      .from(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.key, key),
          eq(idempotencyKeys.endpoint, endpoint),
        ),
      );
    return rows[0];
  }

  private replayCachedResponse(
    existing: typeof idempotencyKeys.$inferSelect,
    requestHash: string,
    res: HttpResponse,
  ): Observable<unknown> {
    if (existing.requestHash !== requestHash) {
      throw new ConflictException({
        code: 'IdempotencyKeyReused',
        message: 'This Idempotency-Key was used with a different request body',
      });
    }
    res.statusCode = existing.responseStatus;
    return of(existing.responseBody);
  }

  private executeAndCache(
    next: CallHandler,
    key: string,
    endpoint: string,
    requestHash: string,
    res: HttpResponse,
  ): Observable<unknown> {
    return next
      .handle()
      .pipe(
        switchMap((responseBody) =>
          from(
            this.persistResponse(
              key,
              endpoint,
              requestHash,
              res.statusCode ?? DEFAULT_CREATED_STATUS,
              responseBody,
            ).then(() => responseBody),
          ),
        ),
      );
  }

  private async persistResponse(
    key: string,
    endpoint: string,
    requestHash: string,
    responseStatus: number,
    responseBody: unknown,
  ): Promise<void> {
    try {
      await this.db
        .insert(idempotencyKeys)
        .values({
          key,
          endpoint,
          requestHash,
          responseStatus,
          responseBody: (responseBody ?? null) as object,
        })
        .onConflictDoNothing();
    } catch {
      // Non-fatal: concurrent winners are resolved on the next retry.
    }
  }
}

function extractIdempotencyKey(
  headers: Record<string, string | string[] | undefined>,
): string | undefined {
  const raw = headers['idempotency-key'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function sha256Json(body: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(body ?? null))
    .digest('hex');
}
