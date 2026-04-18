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
]);

type ZodIssue = { path: (string | number)[]; message: string };

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

@Catch()
export class DomainErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse();

    if (exception instanceof ZodValidationException) {
      response.status(exception.getStatus()).json({
        statusCode: exception.getStatus(),
        message: flattenZodIssues(exception),
      });
      return;
    }

    if (exception instanceof HttpException) {
      response.status(exception.getStatus()).json({
        statusCode: exception.getStatus(),
        message: extractHttpMessage(exception),
      });
      return;
    }

    if (!(exception instanceof Error)) {
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
      });
      return;
    }

    const statusCode =
      DOMAIN_ERROR_STATUS_MAP.get(exception.name) ??
      HttpStatus.INTERNAL_SERVER_ERROR;
    response.status(statusCode).json({
      statusCode,
      message: exception.message,
    });
  }
}
