'use client';

import { useEffect, useRef } from 'react';

import type { RouteOptimizeResult } from '@route-kun/api';
import type mapboxgl from 'mapbox-gl';

type RouteGeoJson = RouteOptimizeResult['geoJson'];

type Props = {
  geoJson: RouteGeoJson;
  isFallback: boolean;
  selectedStopId: string | null;
  onSelectStop?: (stopId: string) => void;
};

const ROUTE_SOURCE_ID = 'routekun-route';
const ROUTE_LINE_LAYER = 'routekun-route-line';
const ROUTE_POINT_LAYER = 'routekun-route-points';
const ROUTE_LABEL_LAYER = 'routekun-route-labels';

const PRIMARY_COLOR = '#2563eb';
const FALLBACK_COLOR = '#f97316';
const HIGHLIGHT_COLOR = '#fbbf24';

const findPointCoordinates = (geoJson: RouteGeoJson, stopId: string) => {
  for (const feature of geoJson.features) {
    if (feature.geometry.type !== 'Point') {
      continue;
    }

    const id = (feature.properties as { id?: string }).id;
    if (id === stopId) {
      return feature.geometry.coordinates as [number, number];
    }
  }

  return null;
};

const computeBounds = (geoJson: RouteGeoJson): [[number, number], [number, number]] | null => {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  geoJson.features.forEach((feature) => {
    if (feature.geometry.type === 'Point') {
      const [lng, lat] = feature.geometry.coordinates;
      minLng = Math.min(minLng, lng);
      minLat = Math.min(minLat, lat);
      maxLng = Math.max(maxLng, lng);
      maxLat = Math.max(maxLat, lat);
      return;
    }

    if (feature.geometry.type === 'LineString') {
      feature.geometry.coordinates.forEach(([lng, lat]) => {
        minLng = Math.min(minLng, lng);
        minLat = Math.min(minLat, lat);
        maxLng = Math.max(maxLng, lng);
        maxLat = Math.max(maxLat, lat);
      });
    }
  });

  if (!Number.isFinite(minLng) || !Number.isFinite(minLat) || !Number.isFinite(maxLng) || !Number.isFinite(maxLat)) {
    return null;
  }

  if (minLng === maxLng && minLat === maxLat) {
    const delta = 0.01;
    minLng -= delta;
    maxLng += delta;
    minLat -= delta;
    maxLat += delta;
  }

  return [
    [minLng, minLat],
    [maxLng, maxLat]
  ];
};

export function RouteMap({ geoJson, isFallback, onSelectStop, selectedStopId }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const resizeHandlerRef = useRef<(() => void) | null>(null);
  const routeColor = isFallback ? FALLBACK_COLOR : PRIMARY_COLOR;

  useEffect(() => {
    if (!geoJson || !containerRef.current) {
      return;
    }

    let cancelled = false;

    const initMap = async () => {
      if (mapRef.current) {
        updateSource(mapRef.current, geoJson);
        fitRoute(mapRef.current, geoJson, containerRef.current);
        return;
      }

      const mapboxModule = await import('mapbox-gl');
      if (cancelled || !containerRef.current) {
        return;
      }

      const mapboxgl = mapboxModule.default;
      mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/light-v11',
        attributionControl: false
      });
      mapRef.current = map;

      const setupLayers = () => {
        if (!map.getSource(ROUTE_SOURCE_ID)) {
          map.addSource(ROUTE_SOURCE_ID, {
            type: 'geojson',
            data: geoJson
          });
        }

        if (!map.getLayer(ROUTE_LINE_LAYER)) {
          map.addLayer({
            id: ROUTE_LINE_LAYER,
            type: 'line',
            source: ROUTE_SOURCE_ID,
            filter: ['==', ['geometry-type'], 'LineString'],
            layout: {
              'line-cap': 'round',
              'line-join': 'round'
            },
            paint: {
              'line-color': routeColor,
              'line-width': 4,
              'line-opacity': 0.85
            }
          });
        }

        if (!map.getLayer(ROUTE_POINT_LAYER)) {
          map.addLayer({
            id: ROUTE_POINT_LAYER,
            type: 'circle',
            source: ROUTE_SOURCE_ID,
            filter: ['==', ['geometry-type'], 'Point'],
            paint: {
              'circle-radius': 7,
              'circle-color': routeColor,
              'circle-stroke-width': 2,
              'circle-stroke-color': '#ffffff'
            }
          });
        }

        if (!map.getLayer(ROUTE_LABEL_LAYER)) {
          map.addLayer({
            id: ROUTE_LABEL_LAYER,
            type: 'symbol',
            source: ROUTE_SOURCE_ID,
            filter: ['==', ['geometry-type'], 'Point'],
            layout: {
              'text-field': ['to-string', ['get', 'sequence']],
              'text-size': 12,
              'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
              'text-offset': [0, 1.2],
              'text-anchor': 'top',
              'text-allow-overlap': true
            },
            paint: {
              'text-color': '#0f172a',
              'text-halo-color': '#ffffff',
              'text-halo-width': 1
            }
          });
        }

        fitRoute(map, geoJson, containerRef.current);
      };

      if (map.isStyleLoaded()) {
        setupLayers();
      } else {
        map.once('load', setupLayers);
      }

      map.on('click', ROUTE_POINT_LAYER, (event) => {
        const stopId = event.features?.[0]?.properties?.id as string | undefined;
        if (stopId && onSelectStop) {
          onSelectStop(stopId);
        }
      });

      const handleResize = () => {
        if (!mapRef.current) {
          return;
        }
        fitRoute(mapRef.current, geoJson, containerRef.current);
      };

      window.addEventListener('resize', handleResize);
      resizeHandlerRef.current = handleResize;
    };

    void initMap();

    return () => {
      cancelled = true;
    };
  }, [geoJson, onSelectStop, routeColor]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    if (map.getLayer(ROUTE_LINE_LAYER)) {
      map.setPaintProperty(ROUTE_LINE_LAYER, 'line-color', routeColor);
    }

    if (map.getLayer(ROUTE_POINT_LAYER)) {
      map.setPaintProperty(ROUTE_POINT_LAYER, 'circle-color', [
        'case',
        ['==', ['get', 'id'], selectedStopId ?? ''],
        HIGHLIGHT_COLOR,
        routeColor
      ]);
      map.setPaintProperty(ROUTE_POINT_LAYER, 'circle-stroke-color', routeColor);
    }
  }, [routeColor, selectedStopId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedStopId || !geoJson) {
      return;
    }

    const coordinates = findPointCoordinates(geoJson, selectedStopId);
    if (!coordinates) {
      return;
    }

    if (!map.isStyleLoaded()) {
      map.once('load', () => {
        map.easeTo({ center: coordinates, duration: 500 });
      });
      return;
    }

    map.easeTo({ center: coordinates, duration: 500 });
  }, [geoJson, selectedStopId]);

  useEffect(() => {
    return () => {
      if (resizeHandlerRef.current) {
        window.removeEventListener('resize', resizeHandlerRef.current);
        resizeHandlerRef.current = null;
      }

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return <div ref={containerRef} className="route-map" role="img" aria-label="最適化ルートの地図" data-testid="map-container" />;
}

const fitRoute = (
  map: mapboxgl.Map,
  geoJson: RouteGeoJson,
  container: HTMLElement | null
) => {
  const bounds = computeBounds(geoJson);
  if (!bounds) {
    return;
  }

  const padding = container ? (container.clientWidth < 640 ? 28 : 64) : 48;

  if (map.isStyleLoaded()) {
    map.fitBounds(bounds, { padding, duration: 0 });
  } else {
    map.once('load', () => {
      map.fitBounds(bounds, { padding, duration: 0 });
    });
  }
};

const updateSource = (map: mapboxgl.Map, data: RouteGeoJson) => {
  const source = map.getSource(ROUTE_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
  if (source) {
    source.setData(data);
    return;
  }

  map.addSource(ROUTE_SOURCE_ID, { type: 'geojson', data });
};
