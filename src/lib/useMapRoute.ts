import { useEffect, useState, type RefObject } from 'react';
import L from 'leaflet';
import { fetchDrivingRoute } from './routing';

export interface MapRouteInfo {
  distance: string;
  duration: string;
  duration_sec: number;
}

/** Dibuja polyline OSRM entre dos puntos en un mapa Leaflet */
export function useMapRoute(
  mapRef: RefObject<L.Map | null>,
  polylineRef: RefObject<L.Polyline | null>,
  from: [number, number] | null,
  to: [number, number] | null,
  enabled: boolean,
  options?: { color?: string; fitBounds?: boolean },
) {
  const [routeInfo, setRouteInfo] = useState<MapRouteInfo | null>(null);
  const color = options?.color ?? '#5b8af9';
  const fitBounds = options?.fitBounds ?? true;

  useEffect(() => {
    const map = mapRef.current;
    if (!enabled || !from || !to || !map) {
      if (polylineRef.current && map) {
        map.removeLayer(polylineRef.current);
        polylineRef.current = null;
      }
      setRouteInfo(null);
      return;
    }

    let cancelled = false;

    fetchDrivingRoute(from, to).then((route) => {
      if (cancelled || !route || !mapRef.current) return;

      setRouteInfo({
        distance: `${route.distance_km} km`,
        duration: `${route.duration_min} min`,
        duration_sec: route.duration_sec,
      });

      if (!polylineRef.current) {
        polylineRef.current = L.polyline(route.coordinates, {
          color,
          weight: 5,
          opacity: 0.85,
          lineJoin: 'round',
        }).addTo(mapRef.current);
      } else {
        polylineRef.current.setLatLngs(route.coordinates);
      }

      if (fitBounds && polylineRef.current) {
        try {
          mapRef.current.fitBounds(polylineRef.current.getBounds(), {
            padding: [48, 48],
            maxZoom: 16,
          });
        } catch { /* ignore */ }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, from?.[0], from?.[1], to?.[0], to?.[1], color, fitBounds]);

  return routeInfo;
}
