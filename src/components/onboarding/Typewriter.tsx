import { useEffect, useState, useRef } from 'react';

interface TypewriterProps {
  text: string;
  speed?: number;
  delay?: number;
  onDone?: () => void;
  className?: string;
}

export function Typewriter({ text, speed = 24, delay = 0, onDone, className = '' }: TypewriterProps) {
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
      {!done && <span className="onboarding-cursor" aria-hidden>|</span>}
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

  return (
    <div className="onboarding-narration">
      <div className="onboarding-ai-row">
        <div className="onboarding-ai-orb" style={{ boxShadow: `0 0 20px ${accent}66` }}>
          <span className="onboarding-ai-orb-core" style={{ background: accent }} />
        </div>
        <div>
          <p className="onboarding-ai-label">Asistente IA</p>
          <p className="onboarding-ai-status">
            {phase < 2 ? 'Escribiendo…' : 'Listo para continuar'}
          </p>
        </div>
      </div>

      {subtitle && phase >= 0 && (
        <p className="onboarding-subtitle" style={{ color: accent }}>
          {phase === 0 ? (
            <Typewriter
              key={`sub-${stepKey}`}
              text={subtitle}
              speed={20}
              onDone={() => setPhase(1)}
            />
          ) : (
            subtitle
          )}
        </p>
      )}

      {phase >= 1 && (
        <h2 id="onboarding-title" className="onboarding-title">
          {phase === 1 ? (
            <Typewriter
              key={`tit-${stepKey}`}
              text={title}
              speed={32}
              onDone={() => setPhase(2)}
            />
          ) : (
            title
          )}
        </h2>
      )}

      {phase >= 2 && (
        <p className="onboarding-body">
          <Typewriter key={`bod-${stepKey}`} text={body} speed={16} delay={120} />
        </p>
      )}
    </div>
  );
}
