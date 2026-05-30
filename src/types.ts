export interface User {
  id: string;
  name: string;
  role: 'operator' | 'messenger';
}

export interface Customer {
  id?: string;
  name: string;
  phone: string;
  address?: string;
  reference?: string;
  notes?: string;
}

export interface Delivery {
  id: string;
  state: DeliveryState;
  delivery_fee: number;
  location_link: string | null;
  address_override: string | null;
  notes: string | null;
  external_ref: string | null;
  assigned_at: string | null;
  delivered_at: string | null;
  created_at: string;
  customer_confirmed: boolean;
  rating: number | null;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string | null;
  customer_reference: string | null;
  messenger_id: string | null;
  messenger_name: string | null;
  messenger_phone: string | null;
}

export type DeliveryState = 'draft' | 'assigned' | 'in_transit' | 'delivered' | 'cancelled';

export interface ShareData {
  id: string;
  state: string;
  customer: { name: string; phone: string };
  messenger: { name: string; phone: string } | null;
  customer_token_url: string;
  messenger_token_url: string;
  whatsapp_customer: string | null;
  whatsapp_messenger: string | null;
}

export interface Messenger {
  id: string;
  name: string;
  phone: string | null;
  active: boolean;
}

export const STATE_LABEL: Record<DeliveryState, string> = {
  draft:      'Borrador',
  assigned:   'Asignado',
  in_transit: 'En ruta',
  delivered:  'Entregado',
  cancelled:  'Cancelado',
};

export const STATE_COLOR: Record<DeliveryState, string> = {
  draft:      '#6b7280',
  assigned:   '#2563eb',
  in_transit: '#d97706',
  delivered:  '#16a34a',
  cancelled:  '#dc2626',
};
