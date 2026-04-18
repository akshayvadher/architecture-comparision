import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ZodValidationException } from 'nestjs-zod';

const DOMAIN_ERROR_STATUS_MAP = new Map<string, number>([
  ['InvalidOwnerError', HttpStatus.BAD_REQUEST],
  ['InvalidBalanceError', HttpStatus.BAD_REQUEST],
  ['AccountNotFoundError', HttpStatus.NOT_FOUND],
  ['InvalidIdError', HttpStatus.BAD_REQUEST],
  ['InsufficientFundsError', HttpStatus.BAD_REQUEST],
  ['InvalidAmountError', HttpStatus.BAD_REQUEST],
  ['TransferNotFoundError', HttpStatus.NOT_FOUND],
  ['ConcurrencyError', HttpStatus.CONFLICT],
]);

type ZodIssue = { path: (string | number)[]; message: string };

type ErrorBody = {
  error: { code: string; message: string; requestId: string | undefined };
};

function flattenZodIssues(exception: ZodValidationException): string {
  const zodError = exception.getZodError() as { issues?: ZodIssue[] } | null;
  const issues = zodError?.issues ?? [];
  if (issues.length === 0) {
    return exception.message;
  }
  return issues
    .map((issue) =>
      issue.path.length > 0
        ? `${issue.path.join('.')}: ${issue.message}`
        : issue.message,
    )
    .join('; ');
}

function extractHttpMessage(exception: HttpException): string {
  const body = exception.getResponse();
  if (typeof body === 'string') {
    return body;
  }
  const message = (body as { message?: string | string[] }).message;
  if (Array.isArray(message)) {
    return message.join('; ');
  }
  return message ?? exception.message;
}

function extractHttpCode(exception: HttpException): string {
  const body = exception.getResponse();
  if (typeof body === 'object' && body !== null) {
    const code = (body as { code?: unknown }).code;
    if (typeof code === 'string') {
      return code;
    }
  }
  return exception.constructor.name;
}

function resolveRequestId(req: unknown, res: unknown): string | undefined {
  const reqId = (req as { id?: unknown } | null)?.id;
  if (typeof reqId === 'string') {
    return reqId;
  }
  const getHeader = (res as { getHeader?: (name: string) => unknown } | null)
    ?.getHeader;
  if (typeof getHeader === 'function') {
    const header = getHeader.call(res, 'x-request-id');
    if (typeof header === 'string') {
      return header;
    }
  }
  return undefined;
}

function buildBody(
  code: string,
  message: string,
  requestId: string | undefined,
): ErrorBody {
  return { error: { code, message, requestId } };
}

@Catch()
export class DomainErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse();
    const request = host.switchToHttp().getRequest();
    const requestId = resolveRequestId(request, response);

    if (exception instanceof ZodValidationException) {
      const status = exception.getStatus();
      response
        .status(status)
        .json(
          buildBody('ValidationError', flattenZodIssues(exception), requestId),
        );
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      response
        .status(status)
        .json(
          buildBody(
            extractHttpCode(exception),
            extractHttpMessage(exception),
            requestId,
          ),
        );
      return;
    }

    if (exception instanceof Error) {
      const mapped = DOMAIN_ERROR_STATUS_MAP.get(exception.name);
      if (mapped != null) {
        response
          .status(mapped)
          .json(buildBody(exception.name, exception.message, requestId));
        return;
      }
    }

    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json(
        buildBody('InternalServerError', 'Internal server error', requestId),
      );
  }
}
