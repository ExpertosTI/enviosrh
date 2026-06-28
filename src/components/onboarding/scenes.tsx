import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { APP_RELEASE, RELEASE_NOTES } from '../../lib/releaseNotes';
import type { SceneId } from './types';

function WhatsNewScene({ accent }: { accent: string }) {
  const release = RELEASE_NOTES[APP_RELEASE];
  const items = release?.highlights ?? [];
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % items.length), 2400);
    return () => clearInterval(t);
  }, [items.length]);

  if (!items.length) return null;

  return (
    <div className="onboarding-scene onboarding-scene-whatsnew">
      <motion.div
        className="onboarding-whatsnew-badge"
        style={{ borderColor: `${accent}55`, color: accent }}
        animate={{ scale: [1, 1.04, 1] }}
        transition={{ repeat: Infinity, duration: 2.5 }}
      >
        v{APP_RELEASE}
      </motion.div>
      <AnimatePresence mode="wait">
        <motion.div
          key={idx}
          initial={{ opacity: 0, y: 20, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          className="onboarding-whatsnew-card"
        >
          <span className="onboarding-whatsnew-icon">{items[idx].icon}</span>
          <p className="onboarding-whatsnew-text">{items[idx].text}</p>
        </motion.div>
      </AnimatePresence>
      <div className="onboarding-whatsnew-dots">
        {items.map((_, i) => (
          <div
            key={i}
            className="onboarding-whatsnew-dot"
            style={{ width: i === idx ? 20 : 6, background: i === idx ? accent : '#333' }}
          />
        ))}
      </div>
    </div>
  );
}

function MapRouteScene({ accent }: { accent: string }) {
  const route = 'M 36 118 C 52 118, 58 88, 78 82 S 118 58, 142 62 S 188 38, 218 48 S 248 28, 262 32';

  return (
    <div className="onboarding-scene onboarding-scene-map">
      <svg className="onboarding-map-svg" viewBox="0 0 300 150" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="mapFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#14141c" />
            <stop offset="100%" stopColor="#0a0a0f" />
          </linearGradient>
          <filter id="routeGlow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect width="300" height="150" fill="url(#mapFade)" />

        {/* Streets — Uber-like grid */}
        {[30, 60, 90, 120].map(y => (
          <line key={`h${y}`} x1="0" y1={y} x2="300" y2={y} stroke="#2a2a36" strokeWidth={y % 60 === 0 ? 2.5 : 1} opacity={0.7} />
        ))}
        {[40, 100, 160, 220, 260].map(x => (
          <line key={`v${x}`} x1={x} y1="0" x2={x} y2="150" stroke="#2a2a36" strokeWidth={x % 120 === 40 ? 2.5 : 1} opacity={0.7} />
        ))}

        {/* Route shadow */}
        <motion.path
          d={route}
          fill="none"
          stroke="#000"
          strokeWidth="8"
          strokeLinecap="round"
          opacity={0.35}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 2, ease: 'easeInOut' }}
        />

        {/* Main route */}
        <motion.path
          d={route}
          fill="none"
          stroke="#ffffff"
          strokeWidth="4.5"
          strokeLinecap="round"
          filter="url(#routeGlow)"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 2, ease: 'easeInOut', repeat: Infinity, repeatDelay: 1.2 }}
        />

        {/* Accent highlight on route */}
        <motion.path
          d={route}
          fill="none"
          stroke={accent}
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="6 10"
          initial={{ pathLength: 0, opacity: 0.8 }}
          animate={{ pathLength: 1, opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, ease: 'easeInOut', repeat: Infinity, repeatDelay: 1.2 }}
        />

        {/* Pickup pin */}
        <circle cx="36" cy="118" r="7" fill="#22c55e" stroke="#fff" strokeWidth="2" />
        <circle cx="36" cy="118" r="14" fill="none" stroke="#22c55e" strokeWidth="1.5" opacity="0.4">
          <animate attributeName="r" values="10;18;10" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.5;0;0.5" dur="2s" repeatCount="indefinite" />
        </circle>

        {/* Destination square (Uber style) */}
        <rect x="254" y="24" width="14" height="14" rx="2" fill="#0a0a0f" stroke="#fff" strokeWidth="2.5" />
      </svg>

      {/* Vehicle along route */}
      <motion.div
        className="onboarding-vehicle"
        animate={{ offsetDistance: ['0%', '100%'] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'linear', repeatDelay: 0.6 }}
        style={{ offsetPath: `path('${route}')` }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <rect x="4" y="8" width="16" height="10" rx="3" fill="#111" stroke="#fff" strokeWidth="1.5" />
          <circle cx="8" cy="18" r="2.5" fill="#333" stroke="#aaa" strokeWidth="1" />
          <circle cx="16" cy="18" r="2.5" fill="#333" stroke="#aaa" strokeWidth="1" />
          <path d="M7 8 L9 4 H15 L17 8" stroke="#fff" strokeWidth="1.5" fill="#222" />
        </svg>
      </motion.div>

      <div className="onboarding-eta-pill">
        <span className="onboarding-eta-dot" style={{ background: accent }} />
        <span>ETA</span>
        <motion.strong
          animate={{ opacity: [1, 0.35, 1] }}
          transition={{ repeat: Infinity, duration: 1.4 }}
        >
          4:32
        </motion.strong>
      </div>
    </div>
  );
}

function ChatScene() {
  const msgs = [
    { from: 'messenger', text: 'Voy en camino 🛵' },
    { from: 'customer', text: '¡Gracias! Estoy en la torre B' },
    { from: 'messenger', text: 'Llego en 5 min' },
  ];
  const [visible, setVisible] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setVisible(v => (v < msgs.length ? v + 1 : 0)), 1600);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="onboarding-scene onboarding-scene-chat">
      <AnimatePresence mode="popLayout">
        {msgs.slice(0, visible).map((m, i) => (
          <motion.div
            key={`${m.from}-${i}`}
            initial={{ opacity: 0, y: 14, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className={`onboarding-chat-bubble ${m.from === 'messenger' ? 'is-in' : 'is-out'}`}
          >
            {m.text}
          </motion.div>
        ))}
      </AnimatePresence>
      {visible > 0 && visible < msgs.length && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="onboarding-typing">
          <span /><span /><span />
          IA transcribiendo…
        </motion.div>
      )}
    </div>
  );
}

function GpsScene() {
  return (
    <div className="onboarding-scene onboarding-scene-gps">
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          className="onboarding-gps-ring"
          initial={{ scale: 0.4, opacity: 0.9 }}
          animate={{ scale: 2.8, opacity: 0 }}
          transition={{ duration: 2.2, repeat: Infinity, delay: i * 0.65, ease: 'easeOut' }}
        />
      ))}
      <motion.div
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ repeat: Infinity, duration: 1.6 }}
        className="onboarding-gps-core"
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#22c55e" />
          <circle cx="12" cy="9" r="2.5" fill="#fff" />
        </svg>
      </motion.div>
      <p className="onboarding-gps-label">GPS activo · precisión 8m</p>
    </div>
  );
}

function ProofScene() {
  const items = [
    { icon: '📷', label: 'Foto' },
    { icon: '📱', label: 'QR' },
    { icon: '✍️', label: 'Firma' },
  ];
  return (
    <div className="onboarding-scene onboarding-scene-proof">
      {items.map((item, i) => (
        <motion.div
          key={item.label}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.18, type: 'spring', stiffness: 280 }}
          whileHover={{ scale: 1.06, y: -4 }}
          className="onboarding-proof-tile"
        >
          <motion.span
            animate={{ y: [0, -4, 0] }}
            transition={{ repeat: Infinity, duration: 2.2, delay: i * 0.25 }}
            className="text-2xl"
          >
            {item.icon}
          </motion.span>
          <span>{item.label}</span>
        </motion.div>
      ))}
    </div>
  );
}

function RatingScene({ accent }: { accent: string }) {
  const [hover, setHover] = useState(0);
  const [picked, setPicked] = useState(0);
  return (
    <div className="onboarding-scene onboarding-scene-rating">
      <p className="onboarding-rating-hint">Toca para probar</p>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map(star => (
          <motion.button
            key={star}
            type="button"
            whileTap={{ scale: 0.82 }}
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(0)}
            onClick={() => setPicked(star)}
            className="onboarding-star-btn"
            aria-label={`${star} estrellas`}
          >
            <motion.span
              animate={{
                scale: (hover || picked) >= star ? 1.25 : 1,
                filter: (hover || picked) >= star ? 'drop-shadow(0 0 8px #fbbf24)' : 'grayscale(1) opacity(0.3)',
              }}
            >
              ⭐
            </motion.span>
          </motion.button>
        ))}
      </div>
      <AnimatePresence>
        {picked > 0 && (
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="onboarding-rating-done"
            style={{ color: accent }}
          >
            ¡{picked} estrella{picked > 1 ? 's' : ''}! Gracias 🎉
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

function HeroScene({ accent, role }: { accent: string; role?: string }) {
  const label = role === 'operator' ? 'Nuevo envío' : role === 'messenger' ? 'En ruta' : 'Tu pedido';

  return (
    <div className="onboarding-scene onboarding-scene-hero">
      <div className="onboarding-phone">
        <div className="onboarding-phone-notch" />
        <div className="onboarding-phone-screen">
          <div className="onboarding-phone-header">
            <span style={{ color: accent }}>{label}</span>
            <motion.span
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
              className="onboarding-live-badge"
            >
              EN VIVO
            </motion.span>
          </div>
          <div className="onboarding-phone-map">
            <motion.div
              className="onboarding-phone-route"
              style={{ background: `linear-gradient(90deg, transparent, ${accent}, #fff)` }}
              animate={{ scaleX: [0, 1, 1, 0], originX: 0 }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              className="onboarding-phone-pin"
              style={{ background: accent, boxShadow: `0 0 16px ${accent}` }}
              animate={{ top: ['58%', '28%', '58%'], left: ['18%', '72%', '18%'] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>
          <div className="onboarding-phone-bar">
            <motion.div
              className="onboarding-phone-progress"
              style={{ background: accent }}
              animate={{ width: ['20%', '85%', '20%'] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>
        </div>
      </div>
      <motion.div
        className="onboarding-hero-glow"
        style={{ background: `radial-gradient(circle, ${accent}44 0%, transparent 70%)` }}
        animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.9, 0.5] }}
        transition={{ repeat: Infinity, duration: 3 }}
      />
    </div>
  );
}

function CompleteScene() {
  return (
    <div className="onboarding-scene onboarding-scene-complete">
      {[...Array(16)].map((_, i) => (
        <motion.div
          key={i}
          className="onboarding-confetti"
          style={{ background: ['#fff', '#22c55e', '#5b8af9', '#fbbf24', '#a78bfa'][i % 5] }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
          animate={{
            x: Math.cos(i * 0.4) * (60 + (i % 3) * 20),
            y: Math.sin(i * 0.4) * 50 - 30,
            opacity: 0,
            rotate: 180 + i * 22,
          }}
          transition={{ duration: 1.4, delay: i * 0.04, ease: 'easeOut' }}
        />
      ))}
      <motion.div
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 16 }}
        className="onboarding-complete-icon"
      >
        ✓
      </motion.div>
    </div>
  );
}

function LiveMapScene() {
  const pins = [
    { x: '22%', y: '38%', c: '#5b8af9', label: 'M1' },
    { x: '52%', y: '62%', c: '#f59e0b', label: 'M2' },
    { x: '78%', y: '28%', c: '#22c55e', label: 'M3' },
  ];
  return (
    <div className="onboarding-scene onboarding-scene-live">
      <div className="onboarding-live-grid" />
      {pins.map((p, i) => (
        <motion.div
          key={p.label}
          className="onboarding-live-pin"
          style={{ left: p.x, top: p.y, background: p.c, boxShadow: `0 0 14px ${p.c}` }}
          animate={{ scale: [1, 1.35, 1] }}
          transition={{ repeat: Infinity, duration: 1.6, delay: i * 0.35 }}
        >
          {p.label}
        </motion.div>
      ))}
      <motion.div
        className="onboarding-live-scan"
        animate={{ top: ['0%', '100%'] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
      />
    </div>
  );
}

export function TourScene({ scene, accent, role }: { scene: SceneId; accent: string; role?: string }) {
  switch (scene) {
    case 'whats-new': return <WhatsNewScene accent={accent} />;
    case 'map-route': return <MapRouteScene accent={accent} />;
    case 'chat': return <ChatScene />;
    case 'gps': return <GpsScene />;
    case 'delivery-proof': return <ProofScene />;
    case 'rating': return <RatingScene accent={accent} />;
    case 'live-map': return <LiveMapScene />;
    case 'complete': return <CompleteScene />;
    case 'hero':
    default: return <HeroScene accent={accent} role={role} />;
  }
}
