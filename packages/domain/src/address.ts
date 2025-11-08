import { z } from 'zod';

export const AddressSchema = z.object({
  line1: z.string().min(1),
  line2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().default('JP')
});

export type Address = z.infer<typeof AddressSchema>;

export function normalizeAddress(input: string): string {
  return input.trim().replace(/\s+/g, ' ');
}

