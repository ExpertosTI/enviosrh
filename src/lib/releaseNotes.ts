/** Incrementar en cada release con novedades visibles para el usuario */
export const APP_RELEASE = '3.2.0';

export interface ReleaseNote {
  title: string;
  highlights: string[];
}

export const RELEASE_NOTES: Record<string, ReleaseNote> = {
  '3.2.0': {
    title: 'Onboarding interactivo',
    highlights: [
      'Tour animado con spotlight en menús clave',
      'Mini demos: mapa, chat, GPS y calificación',
      'Anuncio automático en cada actualización',
    ],
  },
  '3.1.0': {
    title: 'Ruta en vivo y mejoras',
    highlights: [
      'Ruta trazada en el mapa entre mensajero y cliente',
      'ETA en cuenta regresiva mientras el repartidor se acerca',
      'Mapa en vivo para operadores',
      'Push, geofencing y chat en tiempo real',
    ],
  },
  '3.0.0': {
    title: 'Gran actualización 2026',
    highlights: [
      'Chat con indicador de escritura y confirmación de lectura',
      'Modo offline, QR y navegación paso a paso',
      'Zonas de cobertura y auto-asignación inteligente',
    ],
  },
};

export function storageKey(role: string, kind: 'release' | 'welcome') {
  return kind === 'release' ? `enviosrh_release_${role}` : `enviosrh_welcome_${role}`;
}
