import type { Coordinates } from '@route-kun/domain';

export type GeocodeCoordinates = Coordinates;

export async function geocodeAddresses(addresses: string[]): Promise<GeocodeCoordinates[]> {
  throw new Error('geocodeAddresses is not implemented yet');
}
