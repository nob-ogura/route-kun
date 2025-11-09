export const tokyoStationGeocodeFixture = {
  results: [
    {
      formatted_address: '1 Chome-9 Marunouchi, Chiyoda City, Tokyo 100-0005, Japan',
      geometry: {
        location: {
          lat: 35.681236,
          lng: 139.767125
        },
        location_type: 'ROOFTOP',
        viewport: {
          northeast: { lat: 35.6825859802915, lng: 139.7684739802915 },
          southwest: { lat: 35.6798880197085, lng: 139.7657760197085 }
        }
      },
      place_id: 'ChIJZ5cYCXuLGGAR0EY1_Qs2CrI',
      types: ['train_station', 'transit_station', 'point_of_interest', 'establishment']
    }
  ],
  status: 'OK'
} as const;

export const tokyoDistanceMatrixFixture = {
  destination_addresses: ['Tokyo Tower, Minato City, Tokyo', 'Sensoji Temple, Taito City, Tokyo', 'Tokyo Skytree, Sumida City, Tokyo'],
  origin_addresses: ['Tokyo Station, Chiyoda City, Tokyo'],
  rows: [
    {
      elements: [
        {
          status: 'OK',
          distance: { text: '3.2 km', value: 3200 },
          duration: { text: '16 mins', value: 950 }
        },
        {
          status: 'OK',
          distance: { text: '7.4 km', value: 7400 },
          duration: { text: '37 mins', value: 2200 }
        },
        {
          status: 'OK',
          distance: { text: '8.7 km', value: 8700 },
          duration: { text: '44 mins', value: 2650 }
        }
      ]
    }
  ],
  status: 'OK'
} as const;

export const googleRateLimitErrorFixture = {
  error_message: 'You have exceeded your daily request quota for this API.',
  status: 'OVER_QUERY_LIMIT'
} as const;

export const singleDistanceMatrixFixture = {
  destination_addresses: ['Destination Address'],
  origin_addresses: ['Origin Address'],
  rows: [
    {
      elements: [
        {
          status: 'OK',
          distance: { text: '5.0 km', value: 5000 },
          duration: { text: '10 mins', value: 600 }
        }
      ]
    }
  ],
  status: 'OK'
} as const;

export const distanceMatrixNotFoundFixture = {
  destination_addresses: ['Unknown Address'],
  origin_addresses: ['Unknown Address'],
  rows: [
    {
      elements: [
        {
          status: 'NOT_FOUND'
        }
      ]
    }
  ],
  status: 'OK'
} as const;
