import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const createAccountSchema = z.object({
  owner: z
    .string({ error: 'Owner name is required' })
    .trim()
    .min(1, 'Owner name is required'),
  balance: z
    .number({ error: 'Initial balance is required' })
    .finite()
    .nonnegative('Initial balance cannot be negative'),
});

export class CreateAccountDto extends createZodDto(createAccountSchema) {}
