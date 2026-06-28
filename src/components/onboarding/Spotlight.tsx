import { useEffect, useState, useId } from 'react';
import { motion } from 'framer-motion';

interface SpotlightProps {
  target?: string;
  active: boolean;
  children: React.ReactNode;
}

export function Spotlight({ target, active, children }: SpotlightProps) {
  const maskId = useId().replace(/:/g, '');
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!active || !target) {
      setRect(null);
      return;
    }

    const update = () => {
      const el = document.querySelector(target);
      if (!el) { setRect(null); return; }
      setRect(el.getBoundingClientRect());
      el.classList.add('onboarding-spotlight-target');
    };

    update();
    const t = setTimeout(update, 100);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);

    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      document.querySelector(target)?.classList.remove('onboarding-spotlight-target');
    };
  }, [target, active]);

  const pad = 10;
  const hole = rect
    ? {
        x: Math.max(0, rect.x - pad),
        y: Math.max(0, rect.y - pad),
        w: rect.width + pad * 2,
        h: rect.height + pad * 2,
      }
    : null;

  return (
    <>
      {active && hole && (
        <motion.div
          className="fixed inset-0 z-[1998] pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <svg className="w-full h-full">
            <defs>
              <mask id={maskId}>
                <rect width="100%" height="100%" fill="white" />
                <rect
                  x={hole.x}
                  y={hole.y}
                  width={hole.w}
                  height={hole.h}
                  rx="14"
                  fill="black"
                />
              </mask>
            </defs>
            <rect
              width="100%"
              height="100%"
              fill="rgba(0,0,0,0.82)"
              mask={`url(#${maskId})`}
            />
          </svg>
          <motion.div
            className="absolute rounded-[14px] ring-2 ring-[#5b8af9] ring-offset-2 ring-offset-transparent pointer-events-none"
            style={{ left: hole.x, top: hole.y, width: hole.w, height: hole.h }}
            animate={{ boxShadow: ['0 0 0 0 rgba(91,138,249,0.5)', '0 0 0 12px rgba(91,138,249,0)', '0 0 0 0 rgba(91,138,249,0.5)'] }}
            transition={{ repeat: Infinity, duration: 2 }}
          />
        </motion.div>
      )}
      {active && !hole && (
        <motion.div
          className="fixed inset-0 z-[1998] bg-black/80 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        />
      )}
      {children}
    </>
  );
}
