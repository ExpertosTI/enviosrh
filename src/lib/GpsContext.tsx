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

  const queueLocation = (loc: any) => {
    try {
      const stored = localStorage.getItem('enviosrh_gps_queue');
      const queue = stored ? JSON.parse(stored) : [];
      queue.push(loc);
      if (queue.length > 100) queue.shift();
      localStorage.setItem('enviosrh_gps_queue', JSON.stringify(queue));
    } catch (e) {
      console.warn('[GPS Cache] Error:', e);
    }
  };

  const syncQueue = async () => {
    try {
      const stored = localStorage.getItem('enviosrh_gps_queue');
      if (!stored) return;
      const queue = JSON.parse(stored);
      if (queue.length === 0) return;

      await api.post('/users/location/bulk', { locations: queue });
      localStorage.removeItem('enviosrh_gps_queue');
      console.log(`[GPS Cache] Sincronizados ${queue.length} registros offline.`);
    } catch (e) {
      console.warn('[GPS Sync] Reintento fallido:', e);
    }
  };

  const sendLocation = async (lat: number, lng: number, acc: number) => {
    let batteryLevel: number | undefined = undefined;
    try {
      if ('getBattery' in navigator) {
        const battery: any = await (navigator as any).getBattery();
        batteryLevel = Math.round(battery.level * 100);
      }
    } catch {}

    const payload = {
      latitude: lat,
      longitude: lng,
      timestamp: Date.now(),
      battery_level: batteryLevel,
      signal_quality: acc < 20 ? 'excelente' : acc < 50 ? 'buena' : 'baja'
    };

    if (!navigator.onLine) {
      queueLocation(payload);
      return;
    }

    try {
      await api.post('/users/location', {
        latitude: payload.latitude,
        longitude: payload.longitude,
        battery_level: payload.battery_level,
        signal_quality: payload.signal_quality
      });
      syncQueue();
    } catch (err) {
      queueLocation(payload);
    }
  };

  // Escuchar evento online para sincronizar cola
  useEffect(() => {
    const handleOnline = () => {
      syncQueue();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

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
          sendLocation(newCoords[0], newCoords[1], pos.coords.accuracy);
        } else if (!pendingReportRef.current) {
          const delay = REPORT_THROTTLE_MS - (now - lastReportRef.current);
          pendingReportRef.current = setTimeout(() => {
            lastReportRef.current = Date.now();
            pendingReportRef.current = null;
            sendLocation(newCoords[0], newCoords[1], pos.coords.accuracy);
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
