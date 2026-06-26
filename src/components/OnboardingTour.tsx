import { useState, useEffect } from 'react';

interface Step {
  title: string;
  body: string;
  target?: string;
}

const TOURS: Record<string, Step[]> = {
  operator: [
    { title: 'Bienvenido operador', body: 'Desde aquí gestionas envíos, mensajeros y reportes.' },
    { title: 'Nuevo envío', body: 'Crea pedidos y el sistema puede auto-asignar al mensajero más cercano.', target: '[href="/operador/nuevo"]' },
    { title: 'Mapa en vivo', body: 'Ve todos los mensajeros y entregas activas en tiempo real.', target: '[href="/operador/mapa"]' },
  ],
  messenger: [
    { title: 'Panel mensajero', body: 'Aquí ves tus envíos del día y la ruta optimizada.' },
    { title: 'GPS activo', body: 'Mantén el GPS encendido para que el cliente te siga en el mapa.' },
    { title: 'Entrega', body: 'Escanea QR, toma foto y firma para confirmar cada entrega.' },
  ],
  customer: [
    { title: 'Seguimiento en vivo', body: 'Ve en el mapa cuándo llega tu pedido.' },
    { title: 'Chat', body: 'Escríbele al mensajero si necesitas algo.' },
    { title: 'Confirmar', body: 'Al recibir, confirma y califica tu experiencia.' },
  ],
};

export function OnboardingTour({ role }: { role: 'operator' | 'messenger' | 'customer' }) {
  const key = `enviosrh_onboarding_${role}`;
  const [step, setStep] = useState(-1);
  const steps = TOURS[role] ?? [];

  useEffect(() => {
    if (!localStorage.getItem(key) && steps.length) setStep(0);
  }, [key, steps.length]);

  if (step < 0 || step >= steps.length) return null;
  const current = steps[step];

  function finish() {
    localStorage.setItem(key, '1');
    setStep(-1);
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div className="bg-[#13131f] border border-[#252540] rounded-2xl p-5 max-w-sm w-full shadow-2xl">
        <div className="text-[10px] text-[#5b8af9] font-bold uppercase mb-1">Paso {step + 1} de {steps.length}</div>
        <h2 id="onboarding-title" className="text-base font-black text-[#e8e8f4] mb-2">{current.title}</h2>
        <p className="text-xs text-[#6b6b8a] leading-relaxed mb-4">{current.body}</p>
        <div className="flex gap-2">
          <button type="button" onClick={finish} className="flex-1 py-2.5 rounded-xl bg-[#252540] text-[#e8e8f4] text-xs font-bold border-0 cursor-pointer">Omitir</button>
          <button
            type="button"
            onClick={() => step + 1 >= steps.length ? finish() : setStep(step + 1)}
            className="flex-1 py-2.5 rounded-xl bg-[#5b8af9] text-white text-xs font-bold border-0 cursor-pointer"
          >
            {step + 1 >= steps.length ? 'Listo' : 'Siguiente'}
          </button>
        </div>
      </div>
    </div>
  );
}
