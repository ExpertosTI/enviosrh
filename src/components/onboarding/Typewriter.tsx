import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';

interface TypewriterProps {
  text: string;
  speed?: number;
  delay?: number;
  onDone?: () => void;
  className?: string;
}

export function Typewriter({ text, speed = 22, delay = 0, onDone, className = '' }: TypewriterProps) {
  const [len, setLen] = useState(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    setLen(0);
    let interval: ReturnType<typeof setInterval> | undefined;
    const start = window.setTimeout(() => {
      let i = 0;
      interval = setInterval(() => {
        i += 1;
        setLen(i);
        if (i >= text.length) {
          clearInterval(interval);
          onDoneRef.current?.();
        }
      }, speed);
    }, delay);

    return () => {
      clearTimeout(start);
      if (interval) clearInterval(interval);
    };
  }, [text, speed, delay]);

  const done = len >= text.length;

  return (
    <span className={className}>
      {text.slice(0, len)}
      {!done && <span className="onboarding-cursor" aria-hidden>▍</span>}
    </span>
  );
}

interface AiNarrationProps {
  subtitle?: string;
  title: string;
  body: string;
  accent: string;
  stepKey: string;
}

export function AiNarration({ subtitle, title, body, accent, stepKey }: AiNarrationProps) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    setPhase(subtitle ? 0 : 1);
  }, [stepKey, subtitle]);

  const typing = phase < 2;

  return (
    <div className="onboarding-narration">
      <div className="onboarding-ai-bubble" style={{ borderColor: `${accent}33` }}>
        <div className="onboarding-ai-header">
          <div className="onboarding-ai-orb" style={{ boxShadow: `0 0 24px ${accent}55` }}>
            <motion.span
              className="onboarding-ai-orb-core"
              style={{ background: accent }}
              animate={{ scale: typing ? [1, 1.35, 1] : 1, opacity: typing ? [1, 0.5, 1] : 1 }}
              transition={{ repeat: typing ? Infinity : 0, duration: 1.4 }}
            />
          </div>
          <div>
            <p className="onboarding-ai-label">Renace AI</p>
            <p className="onboarding-ai-status">
              {phase === 0 && subtitle ? 'Analizando…' : phase === 1 ? 'Explicando…' : 'Listo ✓'}
            </p>
          </div>
          <motion.div
            className="onboarding-ai-pulse"
            style={{ background: accent }}
            animate={{ opacity: typing ? [0.3, 0.8, 0.3] : 0.2, scale: typing ? [1, 1.2, 1] : 1 }}
            transition={{ repeat: typing ? Infinity : 0, duration: 2 }}
          />
        </div>

        <div className="onboarding-ai-content">
          {subtitle && phase >= 0 && (
            <p className="onboarding-subtitle" style={{ color: accent }}>
              {phase === 0 ? (
                <Typewriter key={`sub-${stepKey}`} text={subtitle} speed={18} onDone={() => setPhase(1)} />
              ) : subtitle}
            </p>
          )}

          {phase >= 1 && (
            <h2 id="onboarding-title" className="onboarding-title">
              {phase === 1 ? (
                <Typewriter key={`tit-${stepKey}`} text={title} speed={28} onDone={() => setPhase(2)} />
              ) : title}
            </h2>
          )}

          {phase >= 2 && (
            <p className="onboarding-body">
              <Typewriter key={`bod-${stepKey}`} text={body} speed={14} delay={80} />
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
