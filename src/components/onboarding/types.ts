export type SceneId =
  | 'hero'
  | 'map-route'
  | 'live-map'
  | 'gps'
  | 'chat'
  | 'delivery-proof'
  | 'rating'
  | 'whats-new'
  | 'complete';

export interface TourStep {
  id: string;
  title: string;
  subtitle?: string;
  body: string;
  scene: SceneId;
  target?: string;
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  accent?: string;
}
