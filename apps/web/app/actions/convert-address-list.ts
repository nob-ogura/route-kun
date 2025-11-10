'use server';

import { TRPCError } from '@trpc/server';

import {
  AddressListSchema,
  type AddressListInput,
  type Coordinates,
  type RouteStop
} from '@route-kun/domain';

import { geocodeAddresses } from './geocode-client';
import { getGeocodeCache } from './geocode-cache';

const MAX_DESTINATIONS = 30;
const MAX_ADDRESS_COUNT = MAX_DESTINATIONS + 1;
const DEFAULT_VALIDATION_ERROR_MESSAGE = '住所リストの形式が不正です';
const DESTINATION_LIMIT_ERROR_MESSAGE = `住所は最大 ${MAX_ADDRESS_COUNT} 件まで入力できます`;

type NormalizedAddressesInput = {
  normalizedAddresses: string[];
  rawInput?: string;
};

export type ConvertAddressListInput = string | AddressListInput | NormalizedAddressesInput;

export type ConvertedAddressList = {
  origin: RouteStop;
  destinations: RouteStop[];
};

export async function convertAddressList(
  input: ConvertAddressListInput
): Promise<ConvertedAddressList> {
  const normalizedAddresses = parseNormalizedAddresses(input);

  assertAddressCountWithinLimit(normalizedAddresses.length);

  const coordinates = await geocodeAddresses(normalizedAddresses, {
    cache: getGeocodeCache()
  });

  if (coordinates.length !== normalizedAddresses.length) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: '住所の座標化に失敗しました'
    });
  }

  const stops = normalizedAddresses.map((label, index) =>
    createRouteStop(label, coordinates[index]!)
  );

  return splitOriginAndDestinations(stops);
}

const parseNormalizedAddresses = (input: ConvertAddressListInput): string[] => {
  const rawInput = normalizeToRawInput(input);
  const validation = AddressListSchema.safeParse({ rawInput });

  if (!validation.success) {
    const message = validation.error.issues[0]?.message ?? DEFAULT_VALIDATION_ERROR_MESSAGE;
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message
    });
  }

  return validation.data.normalizedAddresses;
};

const normalizeToRawInput = (input: ConvertAddressListInput): string => {
  if (typeof input === 'string') {
    return input;
  }

  if ('normalizedAddresses' in input) {
    if (typeof input.rawInput === 'string') {
      return input.rawInput;
    }
    return input.normalizedAddresses.join('\n');
  }

  return input.rawInput;
};

const assertAddressCountWithinLimit = (count: number) => {
  if (count > MAX_ADDRESS_COUNT) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: DESTINATION_LIMIT_ERROR_MESSAGE
    });
  }
};

const createRouteStop = (label: string, coordinates: Coordinates): RouteStop => ({
  id: crypto.randomUUID(),
  label,
  lat: coordinates.lat,
  lng: coordinates.lng
});

const splitOriginAndDestinations = (stops: RouteStop[]): ConvertedAddressList => {
  const [origin, ...destinations] = stops;

  if (!origin || destinations.length === 0) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: DEFAULT_VALIDATION_ERROR_MESSAGE
    });
  }

  return {
    origin,
    destinations
  };
};
