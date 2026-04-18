import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const uuidField = z.string().regex(UUID_PATTERN, 'Invalid id format');

export const initiateTransferSchema = z.object({
  fromAccountId: uuidField,
  toAccountId: uuidField,
  amount: z.number().finite().positive('amount must be greater than zero'),
});

export class InitiateTransferDto extends createZodDto(initiateTransferSchema) {}
