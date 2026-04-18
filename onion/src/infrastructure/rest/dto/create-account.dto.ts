import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const createAccountSchema = z.object({
  owner: z.string().trim().min(1, 'owner is required'),
  balance: z.number().finite().nonnegative('balance cannot be negative'),
});

export class CreateAccountDto extends createZodDto(createAccountSchema) {}
