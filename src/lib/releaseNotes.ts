/** Incrementar en cada release con novedades visibles para el usuario */
export const APP_RELEASE = '3.5.0';

export interface ReleaseHighlight {
  icon: string;
  text: string;
}

export interface ReleaseNote {
  title: string;
  tagline: string;
  highlights: ReleaseHighlight[];
}

export const RELEASE_NOTES: Record<string, ReleaseNote> = {
  '3.5.0': {
    title: 'EnviaYa!! — Super App',
    tagline: 'Multi-equipo, ubicación GPS y onboarding completo',
    highlights: [
      { icon: '🚀', text: 'Nueva marca EnviaYa!! para toda tu operación' },
      { icon: '📍', text: 'GPS de empresa y «Mi ubicación» al crear envíos' },
      { icon: '👥', text: 'Tour ampliado: empresa, equipo, colaboradores y mensajeros' },
    ],
  },
  '3.4.0': {
    title: 'EnviaYa AI integrado',
    tagline: 'Tu copiloto inteligente para envíos y operaciones',
    highlights: [
      { icon: '🤖', text: 'Asistente IA con Google Gemini u OpenAI' },
      { icon: '📊', text: 'Consulta envíos, mensajeros y facturación en vivo' },
      { icon: '⚙️', text: 'Configura tus API keys en Panel Admin' },
    ],
  },
  '3.3.0': {
    title: 'Tu app, reinventada',
    tagline: 'Más elegante, más rápida, más inteligente',
    highlights: [
      { icon: '🗺️', text: 'Mapa en vivo con rutas animadas' },
      { icon: '🤖', text: 'Guía inteligente paso a paso' },
      { icon: '💬', text: 'Chat y notificaciones al instante' },
    ],
  },
  '3.2.1': {
    title: 'Mejoras de experiencia',
    tagline: 'Interfaz más clara y fluida',
    highlights: [
      { icon: '✨', text: 'Diseño renovado en todo el recorrido' },
      { icon: '📍', text: 'Seguimiento en mapa más preciso' },
      { icon: '⚡', text: 'Navegación más rápida' },
    ],
  },
  '3.2.0': {
    title: 'Tour interactivo',
    tagline: 'Aprende la app en segundos',
    highlights: [
      { icon: '🎯', text: 'Te guiamos por cada función clave' },
      { icon: '🛵', text: 'Demos en vivo de mapa y chat' },
      { icon: '🔔', text: 'Avisos de cada actualización' },
    ],
  },
  '3.1.0': {
    title: 'Ruta en vivo',
    tagline: 'Cliente y mensajero conectados',
    highlights: [
      { icon: '📍', text: 'Ruta trazada entre mensajero y cliente' },
      { icon: '⏱️', text: 'ETA en cuenta regresiva' },
      { icon: '🗺️', text: 'Mapa en vivo para operadores' },
    ],
  },
};

export function storageKey(role: string, kind: 'release' | 'welcome') {
  return kind === 'release' ? `enviosrh_release_${role}` : `enviosrh_welcome_${role}`;
}

/** Limpia estado del tour. Usar con ?tour=reset en la URL o desde consola del navegador. */
export function resetOnboarding(role?: string) {
  const roles = role ? [role] : ['operator', 'messenger', 'customer'];
  for (const r of roles) {
    localStorage.removeItem(storageKey(r, 'welcome'));
    localStorage.removeItem(storageKey(r, 'release'));
    localStorage.removeItem(`enviosrh_onboarding_${r}`);
  }
}
