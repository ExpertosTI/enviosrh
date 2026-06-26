import { getBaseUrl } from './api';

export interface DrivingRoute {
  coordinates: [number, number][];
  distance_km: number;
  duration_sec: number;
  duration_min: number;
}

/** Obtiene ruta manejable vía API (evita CORS y unifica OSRM) */
export async function fetchDrivingRoute(
  from: [number, number],
  to: [number, number],
): Promise<DrivingRoute | null> {
  const params = new URLSearchParams({
    from_lat: String(from[0]),
    from_lng: String(from[1]),
    to_lat: String(to[0]),
    to_lng: String(to[1]),
  });
  try {
    const res = await fetch(`${getBaseUrl()}/route/directions?${params}`);
    if (!res.ok) return null;
    const data = await res.json() as {
      coordinates?: [number, number][];
      distance_km?: number;
      duration_sec?: number;
      duration_min?: number;
    };
    if (!data.coordinates?.length) return null;
    return {
      coordinates: data.coordinates,
      distance_km: data.distance_km ?? 0,
      duration_sec: data.duration_sec ?? 0,
      duration_min: data.duration_min ?? 0,
    };
  } catch {
    return null;
  }
}

export function formatRouteDuration(seconds: number) {
  if (seconds <= 0) return '¡Llegando!';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
