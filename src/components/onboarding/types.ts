export type SceneId =
  | 'hero'
  | 'map-route'
  | 'live-map'
  | 'gps'
  | 'chat'
  | 'delivery-proof'
  | 'rating'
  | 'update-carousel'
  | 'complete';

export interface TourStep {
  id: string;
  title: string;
  subtitle?: string;
  body: string;
  scene: SceneId;
  /** Selector CSS para spotlight (opcional) */
  target?: string;
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  accent?: string;
}
