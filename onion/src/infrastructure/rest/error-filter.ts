import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';

const DOMAIN_ERROR_STATUS_MAP = new Map<string, number>([
  ['InvalidOwnerError', HttpStatus.BAD_REQUEST],
  ['InvalidBalanceError', HttpStatus.BAD_REQUEST],
  ['AccountNotFoundError', HttpStatus.NOT_FOUND],
  ['InvalidIdError', HttpStatus.BAD_REQUEST],
  ['InsufficientFundsError', HttpStatus.BAD_REQUEST],
  ['InvalidAmountError', HttpStatus.BAD_REQUEST],
  ['TransferNotFoundError', HttpStatus.NOT_FOUND],
]);

@Catch()
export class DomainErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse();

    if (!(exception instanceof Error)) {
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
      });
      return;
    }

    const statusCode =
      DOMAIN_ERROR_STATUS_MAP.get(exception.name) ?? HttpStatus.INTERNAL_SERVER_ERROR;
    response.status(statusCode).json({
      statusCode,
      message: exception.message,
    });
  }
}
