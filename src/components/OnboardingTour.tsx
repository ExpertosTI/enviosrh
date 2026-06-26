import { useState, useEffect } from 'react';
import { APP_RELEASE, RELEASE_NOTES, storageKey } from '../lib/releaseNotes';

interface Step {
  title: string;
  body: string;
}

const WELCOME_TOURS: Record<string, Step[]> = {
  operator: [
    { title: 'Bienvenido operador', body: 'Gestiona envíos, mensajeros y reportes desde un solo lugar.' },
    { title: 'Nuevo envío', body: 'Crea pedidos y el sistema puede auto-asignar al mensajero más cercano.' },
    { title: 'Mapa en vivo', body: 'Ve mensajeros y entregas activas con ruta en tiempo real.' },
  ],
  messenger: [
    { title: 'Panel mensajero', body: 'Tus envíos del día, ruta optimizada y navegación en el mapa.' },
    { title: 'GPS activo', body: 'Mantén el GPS encendido: el cliente verá tu ruta hacia su ubicación.' },
    { title: 'Confirmar entrega', body: 'Escanea QR, toma foto y captura la firma del cliente.' },
  ],
  customer: [
    { title: 'Seguimiento en vivo', body: 'Sigue la ruta de tu repartidor en el mapa con tiempo estimado.' },
    { title: 'Chat directo', body: 'Escríbele al mensajero si necesitas coordinar la entrega.' },
    { title: 'Confirmar recepción', body: 'Al recibir tu pedido, confirma y califica el servicio.' },
  ],
};

type Mode = 'welcome' | 'update' | null;

export function OnboardingTour({ role }: { role: 'operator' | 'messenger' | 'customer' }) {
  const [mode, setMode] = useState<Mode>(null);
  const [step, setStep] = useState(0);

  const welcomeSteps = WELCOME_TOURS[role] ?? [];
  const release = RELEASE_NOTES[APP_RELEASE];
  const updateSteps: Step[] = release
    ? [
        { title: `¡Actualización ${APP_RELEASE}!`, body: release.title },
        ...release.highlights.map((h, i) => ({
          title: `Novedad ${i + 1}`,
          body: h,
        })),
      ]
    : [];

  const steps = mode === 'update' ? updateSteps : welcomeSteps;

  useEffect(() => {
    const welcomeKey = storageKey(role, 'welcome');
    const releaseKey = storageKey(role, 'release');
    // Migrar clave antigua de onboarding
    const legacy = localStorage.getItem(`enviosrh_onboarding_${role}`);
    if (legacy && !localStorage.getItem(welcomeKey)) {
      localStorage.setItem(welcomeKey, '1');
    }
    const seenWelcome = localStorage.getItem(welcomeKey);
    const seenRelease = localStorage.getItem(releaseKey);

    if (!seenWelcome && welcomeSteps.length) {
      setMode('welcome');
      setStep(0);
    } else if (seenRelease !== APP_RELEASE && updateSteps.length) {
      setMode('update');
      setStep(0);
    }
  }, [role]);

  function finish() {
    if (mode === 'welcome') {
      localStorage.setItem(storageKey(role, 'welcome'), '1');
    }
    localStorage.setItem(storageKey(role, 'release'), APP_RELEASE);
    setMode(null);
  }

  if (!mode || step < 0 || step >= steps.length) return null;
  const current = steps[step];
  const isUpdate = mode === 'update';

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="bg-[#13131f] border border-[#252540] rounded-2xl p-5 max-w-sm w-full shadow-2xl">
        <div className="flex items-center gap-2 mb-2">
          {isUpdate && (
            <span className="px-2 py-0.5 rounded-full bg-[#5b8af9]/20 text-[#5b8af9] text-[9px] font-black uppercase">
              Nueva versión
            </span>
          )}
          <span className="text-[10px] text-[#6b6b8a] font-bold">
            {step + 1} / {steps.length}
          </span>
        </div>
        <h2 id="onboarding-title" className="text-base font-black text-[#e8e8f4] mb-2">
          {current.title}
        </h2>
        <p className="text-xs text-[#6b6b8a] leading-relaxed mb-4">{current.body}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={finish}
            className="flex-1 py-2.5 rounded-xl bg-[#252540] text-[#e8e8f4] text-xs font-bold border-0 cursor-pointer"
          >
            {isUpdate ? 'Entendido' : 'Omitir'}
          </button>
          <button
            type="button"
            onClick={() => (step + 1 >= steps.length ? finish() : setStep(step + 1))}
            className="flex-1 py-2.5 rounded-xl bg-[#5b8af9] text-white text-xs font-bold border-0 cursor-pointer"
          >
            {step + 1 >= steps.length ? '¡Listo!' : 'Siguiente'}
          </button>
        </div>
      </div>
    </div>
  );
}
