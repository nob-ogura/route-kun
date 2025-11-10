import { describe, expect, it, vi } from 'vitest';

import { tokyoStationGeocodeFixture } from '@route-kun/msw/fixtures/google';

import { convertAddressList } from './convert-address-list';

describe('convertAddressList integration', () => {
  it('returns RouteStop entries using the real geocode client', async () => {
    let counter = 0;
    const uuidSpy = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => `stop-${counter++}`);

    try {
      const result = await convertAddressList({
        rawInput: '東京都千代田区丸の内1-9-1\n大阪府大阪市北区梅田3-1-1'
      });

      expect(result.origin.label).toBe('東京都千代田区丸の内1-9-1');
      expect(result.destinations[0]?.label).toBe('大阪府大阪市北区梅田3-1-1');
      expect(result.origin.lat).toBe(tokyoStationGeocodeFixture.results[0]?.geometry.location.lat);
      expect(result.origin.lng).toBe(tokyoStationGeocodeFixture.results[0]?.geometry.location.lng);
      expect(result.destinations[0]?.id).toBe('stop-1');
    } finally {
      uuidSpy.mockRestore();
    }
  });
});
