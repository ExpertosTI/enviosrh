import { createContext, useContext, useCallback, useRef, useState, type ReactNode } from 'react';
import { api } from './api';
import { getSession } from './auth';
import { registerPlugin } from '@capacitor/core';
import { Device } from '@capacitor/device';

const BackgroundGeolocation = registerPlugin<any>("BackgroundGeolocation");

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

const REPORT_THROTTLE_MS = 5000;

export function GpsProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<GpsStatus>('idle');
  const [coords, setCoords] = useState<[number, number] | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const watchIdRef = useRef<string | number | null>(null);
  const lastReportRef = useRef<number>(0);

  const queueLocation = (loc: Record<string, unknown>) => {
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
    } catch (e) {
      console.warn('[GPS Sync] Reintento fallido:', e);
    }
  };

  const sendLocation = async (lat: number, lng: number, acc: number) => {
    if (getSession()?.role !== 'messenger') return;

    let batteryLevel: number | undefined;
    try {
      const info = await Device.getBatteryInfo();
      batteryLevel = Math.round((info.batteryLevel || 0) * 100);
    } catch { /* ignore */ }

    const payload = {
      latitude: lat,
      longitude: lng,
      timestamp: Date.now(),
      battery_level: batteryLevel,
      signal_quality: acc < 20 ? 'excelente' : acc < 50 ? 'buena' : 'baja',
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
        signal_quality: payload.signal_quality,
      });
      syncQueue();
    } catch {
      queueLocation(payload);
    }
  };

  const stopWatch = useCallback(() => {
    const isCapacitor = (window as Window & { Capacitor?: unknown }).Capacitor !== undefined;
    if (watchIdRef.current !== null) {
      if (isCapacitor) {
        BackgroundGeolocation.removeWatcher({ id: watchIdRef.current }).catch(console.error);
      } else if (navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current as number);
      }
      watchIdRef.current = null;
    }
  }, []);

  const startWebWatch = useCallback(() => {
    if (!navigator.geolocation || watchIdRef.current !== null) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const newCoords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setCoords(newCoords);
        setAccuracy(pos.coords.accuracy);
        setStatus('active');

        const now = Date.now();
        if (now - lastReportRef.current >= REPORT_THROTTLE_MS) {
          lastReportRef.current = now;
          sendLocation(newCoords[0], newCoords[1], pos.coords.accuracy);
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setStatus('denied');
        else setStatus('unavailable');
        watchIdRef.current = null;
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 },
    );
  }, []);

  const startNativeWatch = useCallback(async () => {
    if (watchIdRef.current !== null) return;
    try {
      const watcherId = await BackgroundGeolocation.addWatcher(
        {
          backgroundMessage: 'Transmitiendo tu ubicación en tiempo real…',
          backgroundTitle: 'EnviaYa!! activo',
          requestPermissions: true,
          stale: false,
          distanceFilter: 5,
        },
        (location: { latitude: number; longitude: number; accuracy?: number } | null, error: unknown) => {
          if (error) {
            setStatus('error');
            return;
          }
          if (location) {
            const newCoords: [number, number] = [location.latitude, location.longitude];
            setCoords(newCoords);
            setAccuracy(location.accuracy || 10);
            setStatus('active');
            const now = Date.now();
            if (now - lastReportRef.current >= REPORT_THROTTLE_MS) {
              lastReportRef.current = now;
              sendLocation(newCoords[0], newCoords[1], location.accuracy || 10);
            }
          }
        },
      );
      watchIdRef.current = watcherId;
    } catch {
      setStatus('error');
    }
  }, []);

  const requestGps = useCallback(() => {
    if (getSession()?.role !== 'messenger') return;

    stopWatch();
    setStatus('requesting');

    const isCapacitor = (window as Window & { Capacitor?: unknown }).Capacitor !== undefined;

    if (isCapacitor) {
      startNativeWatch();
      return;
    }

    if (!navigator.geolocation) {
      setStatus('unavailable');
      return;
    }

    // getCurrentPosition requiere gesto del usuario — el botón «Activar» lo provee
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const newCoords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setCoords(newCoords);
        setAccuracy(pos.coords.accuracy);
        setStatus('active');
        lastReportRef.current = Date.now();
        sendLocation(newCoords[0], newCoords[1], pos.coords.accuracy);
        startWebWatch();
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setStatus('denied');
        else if (err.code === err.TIMEOUT) setStatus('error');
        else setStatus('unavailable');
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  }, [stopWatch, startWebWatch, startNativeWatch]);

  return (
    <GpsContext.Provider value={{ status, coords, requestGps, accuracy }}>
      {children}
    </GpsContext.Provider>
  );
}
