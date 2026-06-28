import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

interface PremiumTourShellProps {
  children: ReactNode;
  step: number;
  total: number;
  progress: number;
  accent: string;
  isFullscreen: boolean;
  docked?: boolean;
  onSkip: () => void;
  onNext: () => void;
  onPrev: () => void;
  isLast: boolean;
}

export function PremiumTourShell({
  children,
  step,
  total,
  progress,
  accent,
  isFullscreen,
  docked,
  onSkip,
  onNext,
  onPrev,
  isLast,
}: PremiumTourShellProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: docked ? 20 : 40, scale: docked ? 0.97 : 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      className={`onboarding-shell ${isFullscreen ? 'is-fullscreen' : ''} ${docked ? 'is-docked' : ''}`}
    >
      {isFullscreen && (
        <div className="onboarding-mesh" aria-hidden>
          <motion.div
            className="onboarding-mesh-a"
            style={{ background: `radial-gradient(circle, ${accent}30 0%, transparent 70%)` }}
            animate={{ x: [0, 30, 0], y: [0, -20, 0] }}
            transition={{ repeat: Infinity, duration: 8, ease: 'easeInOut' }}
          />
          <motion.div
            className="onboarding-mesh-b"
            animate={{ x: [0, -25, 0], y: [0, 25, 0] }}
            transition={{ repeat: Infinity, duration: 10, ease: 'easeInOut' }}
          />
        </div>
      )}

      <div className="onboarding-shell-inner">
        <header className="onboarding-header">
          <div className="onboarding-step-counter" style={{ color: accent }}>
            {String(step + 1).padStart(2, '0')}
            <span className="onboarding-step-total"> / {String(total).padStart(2, '0')}</span>
          </div>
          <div className="onboarding-header-progress">
            <motion.div
              className="onboarding-header-progress-fill"
              style={{ background: `linear-gradient(90deg, ${accent}, #fff)` }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          </div>
          <button type="button" onClick={onSkip} className="onboarding-skip">
            Omitir
          </button>
        </header>

        <div className="onboarding-body-area">{children}</div>

        <footer className="onboarding-footer">
          <button
            type="button"
            onClick={onPrev}
            disabled={step === 0}
            className="onboarding-btn-back"
          >
            ← Atrás
          </button>
          <button
            type="button"
            onClick={onNext}
            className="onboarding-btn-continue"
            style={{
              background: `linear-gradient(135deg, ${accent}, ${accent}cc)`,
              boxShadow: `0 12px 40px ${accent}44`,
            }}
          >
            {isLast ? 'Comenzar →' : 'Continuar →'}
          </button>
        </footer>
      </div>
    </motion.div>
  );
}
