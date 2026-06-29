/** Obtiene ubicación actual del dispositivo */
export function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Tu navegador no soporta GPS'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 60_000,
    });
  });
}

export function coordsToMapsLink(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

export async function captureMyLocation(): Promise<{ lat: number; lng: number; link: string }> {
  const pos = await getCurrentPosition();
  const lat = pos.coords.latitude;
  const lng = pos.coords.longitude;
  return { lat, lng, link: coordsToMapsLink(lat, lng) };
}
