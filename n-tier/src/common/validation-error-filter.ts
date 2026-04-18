import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import { ZodValidationException } from 'nestjs-zod';

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

@Catch(HttpException)
export class HttpErrorFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse();
    const status = exception.getStatus();
    const message =
      exception instanceof ZodValidationException
        ? flattenZodIssues(exception)
        : extractHttpMessage(exception);
    response.status(status).json({ statusCode: status, message });
  }
}
