import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

type Lang = 'es' | 'en';

const dict: Record<Lang, Record<string, string>> = {
  es: {
    'nav.deliveries': 'Mis envíos',
    'nav.new': 'Nuevo envío',
    'nav.admin': 'Panel Admin',
    'nav.zones': 'Zonas',
    'chat.placeholder': 'Escribe un mensaje…',
    'chat.empty': 'Di algo para iniciar el chat',
    'chat.typing': 'escribiendo…',
    'chat.close': 'Cerrar',
    'delivery.in_transit': 'En camino',
    'delivery.delivered': 'Entregado',
    'delivery.confirm': 'Confirmar entrega',
    'delivery.start': 'Salir a entregar',
    'gps.active': 'GPS Activo',
    'gps.inactive': 'GPS Inactivo',
    'export.csv': 'Exportar CSV',
    'export.pdf': 'Exportar PDF',
    'rating.comment': 'Comentario (opcional)',
    'proximity.alert': '¡Repartidor cerca!',
    'route.optimize': 'Optimizar ruta',
    'qr.scan': 'Escanear código',
  },
  en: {
    'nav.deliveries': 'My deliveries',
    'nav.new': 'New delivery',
    'nav.admin': 'Admin Panel',
    'nav.zones': 'Zones',
    'chat.placeholder': 'Type a message…',
    'chat.empty': 'Say something to start the chat',
    'chat.typing': 'typing…',
    'chat.close': 'Close',
    'delivery.in_transit': 'On the way',
    'delivery.delivered': 'Delivered',
    'delivery.confirm': 'Confirm delivery',
    'delivery.start': 'Start delivery',
    'gps.active': 'GPS Active',
    'gps.inactive': 'GPS Inactive',
    'export.csv': 'Export CSV',
    'export.pdf': 'Export PDF',
    'rating.comment': 'Comment (optional)',
    'proximity.alert': 'Courier nearby!',
    'route.optimize': 'Optimize route',
    'qr.scan': 'Scan code',
  },
};

const I18nCtx = createContext({ lang: 'es' as Lang, t: (k: string) => k, setLang: (_: Lang) => {} });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const s = localStorage.getItem('enviosrh_lang');
    return s === 'en' ? 'en' : 'es';
  });
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem('enviosrh_lang', l);
  }, []);
  const t = useCallback((key: string) => dict[lang][key] ?? key, [lang]);
  return <I18nCtx.Provider value={{ lang, t, setLang }}>{children}</I18nCtx.Provider>;
}

export function useI18n() { return useContext(I18nCtx); }
