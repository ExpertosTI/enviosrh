import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { APP_RELEASE, RELEASE_NOTES, storageKey } from '../lib/releaseNotes';
import { stepsForRole } from './onboarding/steps';
import { Spotlight } from './onboarding/Spotlight';
import { TourScene } from './onboarding/scenes';
import type { TourStep } from './onboarding/types';

type Mode = 'welcome' | 'update' | null;

function UpdateCarousel({ highlights, accent }: { highlights: string[]; accent: string }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % highlights.length), 2800);
    return () => clearInterval(t);
  }, [highlights.length]);

  return (
    <div className="w-full">
      <div className="flex gap-1.5 mb-3 justify-center">
        {highlights.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setIdx(i)}
            className="h-1 rounded-full border-0 cursor-pointer transition-all"
            style={{
              width: i === idx ? 24 : 8,
              background: i === idx ? accent : '#252540',
            }}
            aria-label={`Novedad ${i + 1}`}
          />
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={idx}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.25 }}
          className="p-4 rounded-xl bg-[#0b0b14] border border-[#252540] text-center min-h-[72px] flex items-center justify-center"
        >
          <p className="text-sm font-semibold text-[#e8e8f4] leading-snug">{highlights[idx]}</p>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function cardPosition(target?: string, placement?: string) {
  if (!target || placement === 'center') {
    return { className: 'fixed inset-0 z-[2000] flex items-center justify-center p-4 pointer-events-none' };
  }
  const el = document.querySelector(target);
  if (!el) return { className: 'fixed inset-0 z-[2000] flex items-center justify-center p-4 pointer-events-none' };
  const r = el.getBoundingClientRect();
  const cardW = 320;
  if (placement === 'right') {
    const left = Math.min(r.right + 16, window.innerWidth - cardW - 16);
    const top = Math.max(16, Math.min(r.top, window.innerHeight - 400));
    return { style: { position: 'fixed' as const, left, top, zIndex: 2000, width: cardW } };
  }
  return { className: 'fixed bottom-6 left-1/2 -translate-x-1/2 z-[2000] w-full max-w-sm px-4 pointer-events-none' };
}

export function OnboardingTour({ role }: { role: 'operator' | 'messenger' | 'customer' }) {
  const [mode, setMode] = useState<Mode>(null);
  const [step, setStep] = useState(0);
  const [posKey, setPosKey] = useState(0);

  const welcomeSteps = useMemo(() => stepsForRole(role), [role]);
  const release = RELEASE_NOTES[APP_RELEASE];
  const updateStepCount = release ? 1 : 0;

  const steps = mode === 'update' ? [] : welcomeSteps;
  const isUpdate = mode === 'update';
  const totalSteps = isUpdate ? updateStepCount : steps.length;
  const current: TourStep | null = !isUpdate && steps[step] ? steps[step] : null;
  const accent = current?.accent ?? '#5b8af9';

  useEffect(() => {
    const welcomeKey = storageKey(role, 'welcome');
    const releaseKey = storageKey(role, 'release');
    const legacy = localStorage.getItem(`enviosrh_onboarding_${role}`);
    if (legacy && !localStorage.getItem(welcomeKey)) localStorage.setItem(welcomeKey, '1');

    const seenWelcome = localStorage.getItem(welcomeKey);
    const seenRelease = localStorage.getItem(releaseKey);

    if (!seenWelcome && welcomeSteps.length) {
      setMode('welcome');
      setStep(0);
    } else if (seenRelease !== APP_RELEASE && release) {
      setMode('update');
      setStep(0);
    }
  }, [role, welcomeSteps.length, release]);

  const finish = useCallback(() => {
    if (mode === 'welcome') localStorage.setItem(storageKey(role, 'welcome'), '1');
    localStorage.setItem(storageKey(role, 'release'), APP_RELEASE);
    setMode(null);
  }, [mode, role]);

  const next = useCallback(() => {
    if (step + 1 >= totalSteps) finish();
    else { setStep(s => s + 1); setPosKey(k => k + 1); }
  }, [step, totalSteps, finish]);

  const prev = useCallback(() => {
    if (step > 0) { setStep(s => s - 1); setPosKey(k => k + 1); }
  }, [step]);

  useEffect(() => {
    if (!mode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      if (e.key === 'ArrowRight' || e.key === 'Enter') next();
      if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, next, prev, finish]);

  if (!mode) return null;

  const progress = ((step + 1) / totalSteps) * 100;
  const hasTarget = !!current?.target && current.placement !== 'center';
  const pos = hasTarget ? cardPosition(current?.target, current?.placement) : { className: 'fixed inset-0 z-[2000] flex items-end sm:items-center justify-center p-4 sm:p-6 pointer-events-none' };

  const card = (
    <motion.div
      key={`${mode}-${step}-${posKey}`}
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      className="pointer-events-auto w-full max-w-sm"
      style={'style' in pos ? pos.style : undefined}
    >
      <div
        className="rounded-2xl overflow-hidden shadow-2xl border border-[#252540]/80"
        style={{ background: 'linear-gradient(160deg, #1a1a2e 0%, #13131f 45%, #0b0b14 100%)' }}
      >
        {/* Progress */}
        <div className="h-1 bg-[#252540]">
          <motion.div
            className="h-full"
            style={{ background: `linear-gradient(90deg, ${accent}, ${accent}88)` }}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.35 }}
          />
        </div>

        <div className="p-5 flex flex-col gap-4">
          {isUpdate ? (
            <>
              <div className="flex items-center gap-2">
                <motion.span
                  animate={{ rotate: [0, 10, -10, 0] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="text-2xl"
                >
                  ✨
                </motion.span>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#5b8af9]">Versión {APP_RELEASE}</p>
                  <h2 className="text-lg font-black text-[#e8e8f4]">{release?.title}</h2>
                </div>
              </div>
              {release && <UpdateCarousel highlights={release.highlights} accent={accent} />}
              <p className="text-[10px] text-[#6b6b8a] text-center">Desliza o usa las flechas del teclado ← →</p>
            </>
          ) : current && (
            <>
              {current.scene !== 'hero' || !current.target ? (
                <TourScene scene={current.scene} accent={accent} role={role} />
              ) : (
                <TourScene scene="hero" accent={accent} role={role} />
              )}
              <div>
                {current.subtitle && (
                  <p className="text-[10px] font-black uppercase tracking-wider mb-1" style={{ color: accent }}>
                    {current.subtitle}
                  </p>
                )}
                <h2 id="onboarding-title" className="text-lg font-black text-[#e8e8f4] mb-2 leading-tight">
                  {current.title}
                </h2>
                <p className="text-xs text-[#6b6b8a] leading-relaxed">{current.body}</p>
              </div>
              {current.target && (
                <motion.p
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                  className="text-[10px] text-[#5b8af9] font-bold text-center"
                >
                  ↑ Elemento resaltado en pantalla
                </motion.p>
              )}
            </>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={finish}
              className="px-4 py-2.5 rounded-xl bg-[#252540]/80 text-[#6b6b8a] text-xs font-bold border-0 cursor-pointer hover:text-[#e8e8f4] transition-colors"
            >
              Omitir
            </button>
            <div className="flex-1 flex justify-center gap-1">
              {Array.from({ length: totalSteps }).map((_, i) => (
                <div
                  key={i}
                  className="h-1.5 rounded-full transition-all"
                  style={{
                    width: i === step ? 16 : 6,
                    background: i <= step ? accent : '#252540',
                  }}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={next}
              className="px-5 py-2.5 rounded-xl text-white text-xs font-black border-0 cursor-pointer shadow-lg transition-transform active:scale-95"
              style={{ background: accent, boxShadow: `0 8px 24px ${accent}44` }}
            >
              {step + 1 >= totalSteps ? '¡Empezar!' : 'Siguiente'}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );

  return (
    <Spotlight target={current?.target} active={!!mode && hasTarget}>
      <div role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
        {!hasTarget && (
          <motion.div
            className="fixed inset-0 z-[1999] bg-black/70 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          />
        )}
        <AnimatePresence mode="wait">
          {'className' in pos && pos.className ? (
            <div className={pos.className}>{card}</div>
          ) : (
            card
          )}
        </AnimatePresence>
      </div>
    </Spotlight>
  );
}
