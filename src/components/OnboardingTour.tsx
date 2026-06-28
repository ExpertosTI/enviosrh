import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  APP_RELEASE,
  RELEASE_NOTES,
  resetOnboarding,
  storageKey,
} from '../lib/releaseNotes';
import { stepsForRole } from './onboarding/steps';
import { Spotlight } from './onboarding/Spotlight';
import { TourScene } from './onboarding/scenes';
import { AiNarration } from './onboarding/Typewriter';
import { PremiumTourShell } from './onboarding/PremiumTourShell';
import type { TourStep } from './onboarding/types';

function buildSteps(role: 'operator' | 'messenger' | 'customer', includeWhatsNew: boolean): TourStep[] {
  const base = stepsForRole(role);
  const release = RELEASE_NOTES[APP_RELEASE];
  if (!includeWhatsNew || !release) return base;

  return [
    {
      id: 'whats-new',
      title: release.title,
      subtitle: `Novedades · v${APP_RELEASE}`,
      body: release.tagline,
      scene: 'whats-new',
      placement: 'center',
      accent: '#5b8af9',
    },
    ...base,
  ];
}

function cardPosition(target?: string, placement?: string) {
  if (!target || placement === 'center') {
    return { className: 'onboarding-spotlight-dock' };
  }
  const el = document.querySelector(target);
  if (!el) return { className: 'onboarding-spotlight-dock' };
  const r = el.getBoundingClientRect();
  const cardW = Math.min(380, window.innerWidth - 32);
  if (placement === 'right') {
    const left = Math.min(r.right + 16, window.innerWidth - cardW - 16);
    const top = Math.max(16, Math.min(r.top, window.innerHeight - 420));
    return { style: { position: 'fixed' as const, left, top, zIndex: 2001, width: cardW } };
  }
  return { className: 'onboarding-spotlight-dock' };
}

export function OnboardingTour({ role }: { role: 'operator' | 'messenger' | 'customer' }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [posKey, setPosKey] = useState(0);
  const [withNews, setWithNews] = useState(false);

  const steps = useMemo(() => buildSteps(role, withNews), [role, withNews]);
  const current = steps[step] ?? null;
  const accent = current?.accent ?? '#5b8af9';
  const hasTarget = !!current?.target && current.placement !== 'center';
  const isFullscreen = !hasTarget;

  useEffect(() => {
    const welcomeKey = storageKey(role, 'welcome');
    const releaseKey = storageKey(role, 'release');
    const legacy = localStorage.getItem(`enviosrh_onboarding_${role}`);
    if (legacy && !localStorage.getItem(welcomeKey)) localStorage.setItem(welcomeKey, '1');

    if (searchParams.get('tour') === 'reset') {
      resetOnboarding(role);
      const next = new URLSearchParams(searchParams);
      next.delete('tour');
      setSearchParams(next, { replace: true });
      setWithNews(false);
      setStep(0);
      setActive(true);
      return;
    }

    const seenWelcome = localStorage.getItem(welcomeKey);
    const seenRelease = localStorage.getItem(releaseKey);

    if (!seenWelcome) {
      setWithNews(false);
      setStep(0);
      setActive(true);
    } else if (seenRelease !== APP_RELEASE) {
      setWithNews(true);
      setStep(0);
      setActive(true);
    }
  }, [role, searchParams, setSearchParams]);

  const finish = useCallback(() => {
    localStorage.setItem(storageKey(role, 'welcome'), '1');
    localStorage.setItem(storageKey(role, 'release'), APP_RELEASE);
    setActive(false);
  }, [role]);

  const next = useCallback(() => {
    if (step + 1 >= steps.length) finish();
    else {
      setStep(s => s + 1);
      setPosKey(k => k + 1);
    }
  }, [step, steps.length, finish]);

  const prev = useCallback(() => {
    if (step > 0) {
      setStep(s => s - 1);
      setPosKey(k => k + 1);
    }
  }, [step]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      if (e.key === 'ArrowRight' || e.key === 'Enter') next();
      if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, next, prev, finish]);

  if (!active || !current) return null;

  const progress = ((step + 1) / steps.length) * 100;
  const pos = hasTarget ? cardPosition(current.target, current.placement) : null;

  const panel = (
    <PremiumTourShell
      key={`${step}-${posKey}`}
      step={step}
      total={steps.length}
      progress={progress}
      accent={accent}
      isFullscreen={isFullscreen}
      onSkip={finish}
      onNext={next}
      onPrev={prev}
      isLast={step + 1 >= steps.length}
      docked={'style' in (pos ?? {})}
    >
      <TourScene scene={current.scene} accent={accent} role={role} />
      <AiNarration
        subtitle={current.subtitle}
        title={current.title}
        body={current.body}
        accent={accent}
        stepKey={`${step}-${current.id}`}
      />
      {current.target && (
        <p className="onboarding-spotlight-hint" style={{ color: accent }}>
          ↑ Mira el elemento resaltado en pantalla
        </p>
      )}
    </PremiumTourShell>
  );

  return (
    <Spotlight target={current.target} active accent={accent}>
      <div role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
        {isFullscreen ? (
          <div className="onboarding-fullscreen">{panel}</div>
        ) : (
          <>
            {pos && 'style' in pos ? (
              <div style={pos.style}>{panel}</div>
            ) : (
              <div className={pos?.className ?? 'onboarding-spotlight-dock'}>{panel}</div>
            )}
          </>
        )}
      </div>
    </Spotlight>
  );
}
