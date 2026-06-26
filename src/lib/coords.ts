/** Parsea coordenadas desde links de Google Maps, Waze o texto "lat,lng" */
export function parseLocationLink(link: string | null | undefined): [number, number] | null {
  if (!link?.trim()) return null;
  const s = decodeURIComponent(link.trim());

  // @lat,lng en URLs de Google Maps
  const at = s.match(/@(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/);
  if (at) return [Number(at[1]), Number(at[2])];

  // q=lat,lng o query=lat,lng
  const q = s.match(/[?&](?:q|query)=(-?\d+\.?\d*)[,%2C\s]+(-?\d+\.?\d*)/i);
  if (q) return [Number(q[1]), Number(q[2])];

  // ll=lat,lng
  const ll = s.match(/[?&]ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/i);
  if (ll) return [Number(ll[1]), Number(ll[2])];

  // par lat,lng suelto
  const plain = s.match(/(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
  if (plain) return [Number(plain[1]), Number(plain[2])];

  return null;
}

export function latLngKey(a: [number, number]) {
  return `${a[0].toFixed(5)},${a[1].toFixed(5)}`;
}
