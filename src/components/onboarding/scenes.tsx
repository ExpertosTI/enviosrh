import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { SceneId } from './types';

function MapRouteScene({ accent }: { accent: string }) {
  return (
    <div className="relative w-full h-36 rounded-xl overflow-hidden bg-[#0b0b14] border border-[#252540]">
      <div className="absolute inset-0 opacity-30" style={{
        backgroundImage: 'linear-gradient(#252540 1px, transparent 1px), linear-gradient(90deg, #252540 1px, transparent 1px)',
        backgroundSize: '20px 20px',
      }} />
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 280 144" preserveAspectRatio="none">
        <motion.path
          d="M 30 110 Q 80 40, 140 70 T 250 35"
          fill="none"
          stroke={accent}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray="8 6"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.8, ease: 'easeInOut', repeat: Infinity, repeatDelay: 0.5 }}
        />
      </svg>
      <motion.div
        className="absolute"
        style={{ left: '8%', top: '72%' }}
        animate={{ left: ['8%', '45%', '88%'], top: ['72%', '35%', '18%'] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
      >
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm" style={{ background: `${accent}33`, border: `2px solid ${accent}` }}>
          🛵
        </div>
      </motion.div>
      <div className="absolute right-3 top-3 w-3 h-3 rounded-full bg-[#ef4444] ring-4 ring-[#ef4444]/30" />
      <div className="absolute left-3 bottom-2 px-2 py-0.5 rounded-md bg-[#13131f]/90 text-[9px] font-bold text-[#e8e8f4]">
        ETA <motion.span animate={{ opacity: [1, 0.4, 1] }} transition={{ repeat: Infinity, duration: 1.2 }}>4:32</motion.span>
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
    const t = setInterval(() => setVisible(v => (v < msgs.length ? v + 1 : 0)), 1400);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="w-full h-36 rounded-xl bg-[#0b0b14] border border-[#252540] p-3 flex flex-col gap-2 overflow-hidden">
      <AnimatePresence mode="popLayout">
        {msgs.slice(0, visible).map((m, i) => (
          <motion.div
            key={`${m.from}-${i}`}
            initial={{ opacity: 0, y: 12, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className={`max-w-[75%] px-2.5 py-1.5 rounded-xl text-[10px] font-medium ${
              m.from === 'messenger'
                ? 'self-start bg-[#252540] text-[#e8e8f4] rounded-tl-sm'
                : 'self-end bg-[#5b8af9] text-white rounded-tr-sm'
            }`}
          >
            {m.text}
          </motion.div>
        ))}
      </AnimatePresence>
      {visible > 0 && visible < msgs.length && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="self-start text-[9px] text-[#6b6b8a] flex gap-1">
          <span className="animate-bounce">●</span><span className="animate-bounce" style={{ animationDelay: '0.1s' }}>●</span><span className="animate-bounce" style={{ animationDelay: '0.2s' }}>●</span>
          escribiendo…
        </motion.div>
      )}
    </div>
  );
}

function GpsScene() {
  return (
    <div className="relative w-full h-36 rounded-xl bg-[#0b0b14] border border-[#252540] flex items-center justify-center overflow-hidden">
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          className="absolute w-20 h-20 rounded-full border-2 border-[#22c55e]"
          initial={{ scale: 0.5, opacity: 0.8 }}
          animate={{ scale: 2.5, opacity: 0 }}
          transition={{ duration: 2, repeat: Infinity, delay: i * 0.6, ease: 'easeOut' }}
        />
      ))}
      <motion.div
        animate={{ scale: [1, 1.08, 1] }}
        transition={{ repeat: Infinity, duration: 1.5 }}
        className="relative z-10 w-14 h-14 rounded-full bg-[#22c55e]/20 border-2 border-[#22c55e] flex items-center justify-center text-2xl"
      >
        📍
      </motion.div>
      <div className="absolute bottom-2 text-[9px] font-bold text-[#22c55e] uppercase tracking-wider">GPS Activo</div>
    </div>
  );
}

function ProofScene() {
  const items = ['📷 Foto', '📱 QR', '✍️ Firma'];
  return (
    <div className="w-full h-36 rounded-xl bg-[#0b0b14] border border-[#252540] p-3 flex gap-2">
      {items.map((label, i) => (
        <motion.div
          key={label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.2 }}
          whileHover={{ scale: 1.05 }}
          className="flex-1 rounded-lg bg-[#13131f] border border-[#252540] flex flex-col items-center justify-center gap-1 cursor-default"
        >
          <motion.span
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ repeat: Infinity, duration: 2, delay: i * 0.3 }}
            className="text-xl"
          >
            {label.split(' ')[0]}
          </motion.span>
          <span className="text-[8px] font-bold text-[#6b6b8a]">{label.split(' ')[1]}</span>
        </motion.div>
      ))}
    </div>
  );
}

function RatingScene({ accent }: { accent: string }) {
  const [hover, setHover] = useState(0);
  const [picked, setPicked] = useState(0);
  return (
    <div className="w-full h-36 rounded-xl bg-[#0b0b14] border border-[#252540] flex flex-col items-center justify-center gap-3">
      <p className="text-[10px] text-[#6b6b8a] font-bold uppercase tracking-wider">Toca para probar</p>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map(star => (
          <motion.button
            key={star}
            type="button"
            whileTap={{ scale: 0.85 }}
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(0)}
            onClick={() => setPicked(star)}
            className="text-2xl bg-transparent border-0 cursor-pointer p-0"
            aria-label={`${star} estrellas`}
          >
            <motion.span
              animate={{ scale: (hover || picked) >= star ? 1.2 : 1 }}
              style={{ filter: (hover || picked) >= star ? 'none' : 'grayscale(1) opacity(0.35)' }}
            >
              ⭐
            </motion.span>
          </motion.button>
        ))}
      </div>
      <AnimatePresence>
        {picked > 0 && (
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-xs font-bold"
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
  const emoji = role === 'operator' ? '📦' : role === 'messenger' ? '🛵' : '📍';
  return (
    <div className="relative w-full h-36 rounded-xl overflow-hidden flex items-center justify-center"
      style={{ background: `linear-gradient(135deg, ${accent}22 0%, #0b0b14 60%, ${accent}11 100%)`, border: `1px solid ${accent}44` }}
    >
      <motion.div
        animate={{ y: [0, -8, 0], rotate: [0, 5, -5, 0] }}
        transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
        className="text-5xl"
      >
        {emoji}
      </motion.div>
      {[...Array(6)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1.5 h-1.5 rounded-full"
          style={{ background: accent, left: `${15 + i * 14}%`, top: `${20 + (i % 3) * 25}%` }}
          animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1.2, 0.8] }}
          transition={{ repeat: Infinity, duration: 2, delay: i * 0.25 }}
        />
      ))}
    </div>
  );
}

function CompleteScene() {
  return (
    <div className="w-full h-36 rounded-xl bg-gradient-to-br from-[#22c55e]/20 to-[#5b8af9]/20 border border-[#22c55e]/40 flex items-center justify-center relative overflow-hidden">
      {[...Array(12)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-2 h-2 rounded-sm"
          style={{ background: ['#5b8af9', '#22c55e', '#f59e0b', '#a78bfa'][i % 4], left: '50%', top: '50%' }}
          initial={{ x: 0, y: 0, opacity: 1 }}
          animate={{
            x: (Math.cos(i * 0.52) * 80),
            y: (Math.sin(i * 0.52) * 60) - 20,
            opacity: 0,
            rotate: 360,
          }}
          transition={{ duration: 1.2, delay: i * 0.05, ease: 'easeOut' }}
        />
      ))}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        className="text-4xl"
      >
        🎉
      </motion.div>
    </div>
  );
}

function LiveMapScene() {
  const pins = [
    { x: '25%', y: '40%', c: '#5b8af9' },
    { x: '55%', y: '65%', c: '#f59e0b' },
    { x: '75%', y: '30%', c: '#22c55e' },
  ];
  return (
    <div className="relative w-full h-36 rounded-xl bg-[#0b0b14] border border-[#252540] overflow-hidden">
      <div className="absolute inset-0 opacity-20" style={{
        backgroundImage: 'radial-gradient(#5b8af9 1px, transparent 1px)',
        backgroundSize: '16px 16px',
      }} />
      {pins.map((p, i) => (
        <motion.div
          key={i}
          className="absolute w-3 h-3 rounded-full"
          style={{ left: p.x, top: p.y, background: p.c, boxShadow: `0 0 12px ${p.c}` }}
          animate={{ scale: [1, 1.4, 1] }}
          transition={{ repeat: Infinity, duration: 1.5, delay: i * 0.4 }}
        />
      ))}
      <motion.div
        className="absolute left-[40%] top-[50%] h-0.5 origin-left"
        style={{ width: '35%', background: 'linear-gradient(90deg, #f59e0b, #5b8af9)' }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 1, repeat: Infinity, repeatType: 'reverse' }}
      />
    </div>
  );
}

export function TourScene({ scene, accent, role }: { scene: SceneId; accent: string; role?: string }) {
  switch (scene) {
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
