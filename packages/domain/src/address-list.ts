import { z } from 'zod';

const MIN_UNIQUE_ADDRESSES = 2;
const EMPTY_INPUT_ERROR = '住所を入力してください';
const INSUFFICIENT_UNIQUE_ADDRESSES_ERROR = '2 件以上の住所を入力してください';
const WHITESPACE_PATTERN = /[\s\u3000]+/g;

const normalizeAddress = (value: string) => value.replace(WHITESPACE_PATTERN, ' ').trim();

const uniqueAddresses = (candidates: string[]) => {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const candidate of candidates) {
    if (seen.has(candidate)) {
      continue;
    }

    seen.add(candidate);
    unique.push(candidate);
  }

  return unique;
};

export const AddressListSchema = z
  .object({
    rawInput: z.string()
  })
  .transform(({ rawInput }, ctx) => {
    const normalizedCandidates = rawInput
      .split(/\r?\n/)
      .map(normalizeAddress)
      .filter((value) => value.length > 0);

    if (normalizedCandidates.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: EMPTY_INPUT_ERROR,
        path: ['rawInput']
      });
      return z.NEVER;
    }

    const normalizedAddresses = uniqueAddresses(normalizedCandidates);

    if (normalizedAddresses.length < MIN_UNIQUE_ADDRESSES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: INSUFFICIENT_UNIQUE_ADDRESSES_ERROR,
        path: ['rawInput']
      });
      return z.NEVER;
    }

    return {
      rawInput,
      normalizedAddresses
    };
  });

export type AddressListInput = z.input<typeof AddressListSchema>;
export type AddressList = z.output<typeof AddressListSchema>;
