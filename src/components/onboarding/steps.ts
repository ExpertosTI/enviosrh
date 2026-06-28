import type { TourStep } from './types';

export const OPERATOR_STEPS: TourStep[] = [
  {
    id: 'hero',
    title: 'Bienvenido a Envíos App',
    subtitle: 'Tu centro de control logístico',
    body: 'Gestiona mensajeros, rutas y entregas en tiempo real. Te mostramos lo esencial en 30 segundos.',
    scene: 'hero',
    placement: 'center',
    accent: '#5b8af9',
  },
  {
    id: 'new-delivery',
    title: 'Crear envío',
    subtitle: 'Un clic y listo',
    body: 'Registra cliente, dirección y productos. El sistema puede auto-asignar al mensajero más cercano.',
    scene: 'hero',
    target: '[data-tour="nav-nuevo"]',
    placement: 'right',
    accent: '#22c55e',
  },
  {
    id: 'live-map',
    title: 'Mapa en vivo',
    subtitle: 'Visibilidad total',
    body: 'Sigue cada mensajero y envío activo. Las rutas se dibujan automáticamente en el mapa.',
    scene: 'live-map',
    target: '[data-tour="nav-mapa"]',
    placement: 'right',
    accent: '#f59e0b',
  },
  {
    id: 'route',
    title: 'Ruta inteligente',
    subtitle: 'En tiempo real',
    body: 'Cliente y mensajero comparten la misma ruta con tiempo estimado de llegada.',
    scene: 'map-route',
    placement: 'center',
    accent: '#5b8af9',
  },
  {
    id: 'done',
    title: '¡Listo para operar!',
    subtitle: 'Todo configurado',
    body: 'Explora el panel admin para reportes, zonas y facturación.',
    scene: 'complete',
    placement: 'center',
    accent: '#22c55e',
  },
];

export const MESSENGER_STEPS: TourStep[] = [
  {
    id: 'hero',
    title: 'Hola, mensajero',
    subtitle: 'Tu día empieza aquí',
    body: 'Envíos asignados, ruta optimizada y navegación en un solo lugar.',
    scene: 'hero',
    placement: 'center',
    accent: '#f59e0b',
  },
  {
    id: 'gps',
    title: 'Activa tu GPS',
    subtitle: 'Imprescindible',
    body: 'Sin GPS el cliente no puede verte en el mapa. Mantén la app abierta durante la entrega.',
    scene: 'gps',
    placement: 'center',
    accent: '#22c55e',
  },
  {
    id: 'route',
    title: 'Ruta al cliente',
    subtitle: 'Sigue la línea azul',
    body: 'El mapa traza tu camino. Usa Google Maps o Waze si prefieres navegación externa.',
    scene: 'map-route',
    placement: 'center',
    accent: '#5b8af9',
  },
  {
    id: 'proof',
    title: 'Confirmar entrega',
    subtitle: 'QR · Foto · Firma',
    body: 'Escanea el código, toma evidencia y captura la firma del cliente para cerrar el envío.',
    scene: 'delivery-proof',
    placement: 'center',
    accent: '#a78bfa',
  },
  {
    id: 'done',
    title: '¡A rodar!',
    body: 'Toca un envío para ver mapa, chat y acciones de entrega.',
    scene: 'complete',
    placement: 'center',
    accent: '#22c55e',
  },
];

export const CUSTOMER_STEPS: TourStep[] = [
  {
    id: 'hero',
    title: 'Tu pedido en camino',
    subtitle: 'Seguimiento en vivo',
    body: 'Aquí verás al repartidor moverse en el mapa hasta tu puerta.',
    scene: 'hero',
    placement: 'center',
    accent: '#5b8af9',
  },
  {
    id: 'track',
    title: 'Mapa en tiempo real',
    subtitle: 'Ruta + ETA',
    body: 'La línea azul muestra el recorrido. El contador baja mientras se acerca.',
    scene: 'map-route',
    placement: 'center',
    accent: '#f59e0b',
  },
  {
    id: 'chat',
    title: 'Chat con tu mensajero',
    subtitle: 'Coordina al instante',
    body: 'Escribe si necesitas indicaciones. Verás cuando está escribiendo.',
    scene: 'chat',
    placement: 'center',
    accent: '#5b8af9',
  },
  {
    id: 'rate',
    title: 'Califica tu experiencia',
    subtitle: 'Toca las estrellas',
    body: 'Al recibir, confirma y deja tu opinión. ¡Pruébalo aquí!',
    scene: 'rating',
    placement: 'center',
    accent: '#fbbf24',
  },
  {
    id: 'done',
    title: '¡Disfruta tu pedido!',
    body: 'Recibirás una notificación cuando el mensajero esté cerca.',
    scene: 'complete',
    placement: 'center',
    accent: '#22c55e',
  },
];

export function stepsForRole(role: 'operator' | 'messenger' | 'customer') {
  if (role === 'operator') return OPERATOR_STEPS;
  if (role === 'messenger') return MESSENGER_STEPS;
  return CUSTOMER_STEPS;
}
