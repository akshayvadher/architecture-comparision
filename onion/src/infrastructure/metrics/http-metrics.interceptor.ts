import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Counter, Histogram } from 'prom-client';
import { type Observable, tap } from 'rxjs';

type HttpRequest = {
  method: string;
  route?: { path: string };
  url?: string;
};

type HttpResponse = {
  statusCode: number;
};

const METRICS_ROUTE = '/metrics';

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(
    @InjectMetric('http_request_duration_seconds')
    private readonly histogram: Histogram<string>,
    @InjectMetric('http_requests_total')
    private readonly counter: Counter<string>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<HttpRequest>();
    if (this.isMetricsEndpoint(req)) {
      return next.handle();
    }
    const res = context.switchToHttp().getResponse<HttpResponse>();
    const start = process.hrtime.bigint();
    return next.handle().pipe(
      tap({
        next: () => this.record(req, res, start),
        error: () => this.record(req, res, start),
      }),
    );
  }

  private isMetricsEndpoint(req: HttpRequest): boolean {
    const url = req.url ?? '';
    return url === METRICS_ROUTE || url.startsWith(`${METRICS_ROUTE}?`);
  }

  private record(req: HttpRequest, res: HttpResponse, start: bigint): void {
    const durationSec = Number(process.hrtime.bigint() - start) / 1e9;
    const labels = {
      method: req.method,
      route: req.route?.path ?? 'unmatched',
      status: String(res.statusCode),
    };
    this.histogram.observe(labels, durationSec);
    this.counter.inc(labels);
  }
}
