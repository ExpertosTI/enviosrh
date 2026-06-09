import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from './api';
import { getSession } from './auth';

export type GpsStatus = 'idle' | 'requesting' | 'active' | 'denied' | 'unavailable' | 'error';

interface GpsContextValue {
  status: GpsStatus;
  coords: [number, number] | null;
  requestGps: () => void;
  accuracy: number | null;
}

const GpsContext = createContext<GpsContextValue>({
  status: 'idle',
  coords: null,
  requestGps: () => {},
  accuracy: null,
});

export function useGps() {
  return useContext(GpsContext);
}

/** Intervalo mínimo entre reportes al servidor (ms) */
const REPORT_THROTTLE_MS = 5000;

/**
 * GpsProvider: inicia watchPosition global cuando el usuario es mensajero con sesión activa.
 * Reporta la posición al endpoint autenticado /users/location con throttle de 5s.
 */
export function GpsProvider({ children }: { children: ReactNode }) {
  const session = getSession();
  const isMessenger = session?.role === 'messenger';

  const [status, setStatus] = useState<GpsStatus>('idle');
  const [coords, setCoords] = useState<[number, number] | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastReportRef = useRef<number>(0);
  const pendingReportRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startWatch = () => {
    if (!navigator.geolocation) {
      setStatus('unavailable');
      return;
    }
    if (watchIdRef.current !== null) return; // ya corriendo

    setStatus('requesting');
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const newCoords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setCoords(newCoords);
        setAccuracy(pos.coords.accuracy);
        setStatus('active');

        // Throttle reportes al servidor
        const now = Date.now();
        if (now - lastReportRef.current >= REPORT_THROTTLE_MS) {
          lastReportRef.current = now;
          api.post('/users/location', {
            latitude: newCoords[0],
            longitude: newCoords[1],
          }).catch(() => {/* silencioso, no bloquear UX */});
        } else if (!pendingReportRef.current) {
          const delay = REPORT_THROTTLE_MS - (now - lastReportRef.current);
          pendingReportRef.current = setTimeout(() => {
            lastReportRef.current = Date.now();
            pendingReportRef.current = null;
            api.post('/users/location', {
              latitude: newCoords[0],
              longitude: newCoords[1],
            }).catch(() => {});
          }, delay);
        }
      },
      (err) => {
        console.warn('[GPS] Error:', err.code, err.message);
        if (err.code === err.PERMISSION_DENIED) {
          setStatus('denied');
        } else {
          setStatus('unavailable');
        }
        watchIdRef.current = null;
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const stopWatch = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (pendingReportRef.current) {
      clearTimeout(pendingReportRef.current);
      pendingReportRef.current = null;
    }
  };

  // Iniciar GPS automáticamente si es mensajero con sesión
  useEffect(() => {
    if (!isMessenger) return;
    // Verificar permiso actual antes de pedir
    if ('permissions' in navigator) {
      navigator.permissions.query({ name: 'geolocation' }).then((result) => {
        if (result.state === 'granted') {
          startWatch();
        } else if (result.state === 'prompt') {
          setStatus('idle'); // esperará que el componente lo solicite
        } else {
          setStatus('denied');
        }
        result.onchange = () => {
          if (result.state === 'granted') {
            startWatch();
          } else if (result.state === 'denied') {
            setStatus('denied');
            stopWatch();
          }
        };
      });
    } else {
      // fallback: intenta directamente
      startWatch();
    }

    return () => {
      stopWatch();
    };
  }, [isMessenger]);

  const requestGps = () => {
    if (watchIdRef.current !== null) return;
    startWatch();
  };

  return (
    <GpsContext.Provider value={{ status, coords, requestGps, accuracy }}>
      {children}
    </GpsContext.Provider>
  );
}
