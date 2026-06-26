import type { Tenant } from '../types';

export function applyTenantTheme(tenant: Tenant | null | undefined) {
  const root = document.documentElement;
  
  if (!tenant) {
    // Restaurar valores por defecto
    root.style.removeProperty('--primary-color');
    root.style.removeProperty('--accent-color');
    root.classList.remove('theme-glass');
    return;
  }

  // Colores principales
  if (tenant.primary_color) {
    root.style.setProperty('--primary-color', tenant.primary_color);
  }
  if (tenant.accent_color) {
    root.style.setProperty('--accent-color', tenant.accent_color);
  }

  if (tenant.favicon_url) {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = tenant.favicon_url;
  }

  // Modos de tema visual
  if (tenant.theme_mode === 'glass') {
    root.classList.add('dark');
    root.classList.add('theme-glass');
  } else {
    root.classList.remove('theme-glass');
    if (tenant.theme_mode === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }

  // Dispatch a global event so visual elements (Leaflet maps, charts, etc.) update
  window.dispatchEvent(new Event('themechange'));
}
