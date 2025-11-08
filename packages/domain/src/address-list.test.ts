import { describe, expect, it } from 'vitest';

import { AddressListSchema } from './address-list';

const ERROR_MESSAGES = {
  emptyInput: '住所を入力してください',
  insufficientUniqueAddresses: '2 件以上の住所を入力してください'
} as const;

describe('AddressListSchema', () => {
  it('accepts multiline input and returns normalized addresses', () => {
    const rawInput = ['東京都千代田区丸の内1-1-1', '大阪府大阪市北区梅田1-1-1'].join('\n');

    const result = AddressListSchema.safeParse({ rawInput });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.normalizedAddresses).toEqual([
        '東京都千代田区丸の内1-1-1',
        '大阪府大阪市北区梅田1-1-1'
      ]);
    }
  });

  it('rejects input that only contains blank lines', () => {
    const rawInput = '\n   \n\t';

    const result = AddressListSchema.safeParse({ rawInput });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(ERROR_MESSAGES.emptyInput);
    }
  });

  it('rejects when fewer than two unique addresses remain after normalization', () => {
    const rawInput = ['東京都千代田区丸の内1-1-1', ' 東京都千代田区丸の内1-1-1 '].join('\n');

    const result = AddressListSchema.safeParse({ rawInput });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(ERROR_MESSAGES.insufficientUniqueAddresses);
    }
  });

  it('deduplicates addresses after trimming and normalization', () => {
    const rawInput = [
      ' 東京都千代田区丸の内1-1-1 ',
      '東京都千代田区丸の内1-1-1',
      '大阪府大阪市北区梅田1-1-2'
    ].join('\n');

    const result = AddressListSchema.safeParse({ rawInput });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.normalizedAddresses).toEqual([
        '東京都千代田区丸の内1-1-1',
        '大阪府大阪市北区梅田1-1-2'
      ]);
    }
  });

  it('trims whitespace variations including full-width spaces and collapses them to single spaces', () => {
    const rawInput = ['　東京都  千代田区\t丸の内1-1-1', '大阪府　大阪市  北区 梅田1-1-2'].join('\n');

    const result = AddressListSchema.safeParse({ rawInput });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.normalizedAddresses).toEqual([
        '東京都 千代田区 丸の内1-1-1',
        '大阪府 大阪市 北区 梅田1-1-2'
      ]);
    }
  });
});

