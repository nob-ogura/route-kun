import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { RouteStopSchema } from '@route-kun/domain';

import { convertAddressList } from './convert-address-list';

const geocodeAddressesMock = vi.hoisted(() =>
  vi.fn(async (addresses: string[]) =>
    addresses.map((_, index) => ({
      lat: 35.0 + index,
      lng: 139.0 + index
    }))
  )
);

vi.mock('./geocode-client', () => ({
  geocodeAddresses: geocodeAddressesMock
}));

describe('convertAddressList', () => {
  let randomUUIDSpy: ReturnType<typeof vi.spyOn>;
  let uuidCounter: number;

  beforeEach(() => {
    uuidCounter = 0;
    geocodeAddressesMock.mockClear();
    randomUUIDSpy = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => `stop-${uuidCounter++}`);
  });

  afterEach(() => {
    randomUUIDSpy.mockRestore();
  });

  it('returns origin and destinations when given a valid address list', async () => {
    const addresses = [
      '東京都千代田区丸の内1-9-1',
      '大阪府大阪市北区梅田3-1-1',
      '愛知県名古屋市中村区名駅1-1-4',
      '福岡県福岡市博多区博多駅中央街1-1'
    ];
    const rawInput = addresses.join('\n');

    const result = await convertAddressList({ rawInput });

    expect(RouteStopSchema.parse(result.origin).id).toBe('stop-0');
    expect(result.destinations).toHaveLength(3);
    result.destinations.forEach((stop, index) => {
      expect(RouteStopSchema.parse(stop).id).toBe(`stop-${index + 1}`);
    });
    expect(geocodeAddressesMock).toHaveBeenCalledTimes(1);
    expect(geocodeAddressesMock).toHaveBeenCalledWith(addresses);
  });

  it('deduplicates addresses before invoking geocode', async () => {
    const rawInput = ['東京都千代田区丸の内1-9-1', '東京都千代田区丸の内1-9-1', '大阪府大阪市北区梅田3-1-1'].join(
      '\n'
    );

    const result = await convertAddressList({ rawInput });

    expect(result.destinations).toHaveLength(1);
    expect(result.origin.label).toBe('東京都千代田区丸の内1-9-1');
    expect(result.destinations[0]?.label).toBe('大阪府大阪市北区梅田3-1-1');
    expect(geocodeAddressesMock).toHaveBeenCalledTimes(1);
    expect(geocodeAddressesMock).toHaveBeenCalledWith([
      '東京都千代田区丸の内1-9-1',
      '大阪府大阪市北区梅田3-1-1'
    ]);
    expect(randomUUIDSpy).toHaveBeenCalledTimes(2);
  });

  it('throws a BAD_REQUEST error when more than 31 addresses are provided', async () => {
    const rawInput = Array.from({ length: 32 }, (_, index) => `住所${index + 1}`).join('\n');

    await expect(convertAddressList({ rawInput })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: '住所は最大 31 件まで入力できます'
    });
    expect(geocodeAddressesMock).not.toHaveBeenCalled();
  });

  it('returns AddressListSchema validation errors for empty input', async () => {
    const rawInput = '\n \n \t';

    await expect(convertAddressList({ rawInput })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: '住所を入力してください'
    });
    expect(geocodeAddressesMock).not.toHaveBeenCalled();
  });
});
