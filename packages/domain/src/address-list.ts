import { z } from 'zod';

export const AddressListSchema = z
  .object({
    rawInput: z.string()
  })
  .transform(({ rawInput }) => ({
    rawInput,
    normalizedAddresses: [] as string[]
  }));

export type AddressListInput = z.input<typeof AddressListSchema>;
export type AddressList = z.output<typeof AddressListSchema>;

