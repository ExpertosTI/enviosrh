import { useEffect, useState } from 'react';

interface Step { instruction: string; distance: number; duration: number }

export function TurnByTurn({ origin, dest }: { origin: [number, number] | null; dest: [number, number] | null }) {
  const [steps, setSteps] = useState<Step[]>([]);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!origin || !dest) { setSteps([]); return; }
    const url = `https://router.project-osrm.org/route/v1/driving/${origin[1]},${origin[0]};${dest[1]},${dest[0]}?steps=true&overview=false`;
    fetch(url).then(r => r.json()).then(data => {
      if (data.code !== 'Ok') return;
      const s = data.routes[0].legs[0].steps.map((st: any) => ({
        instruction: st.maneuver.instruction,
        distance: st.distance,
        duration: st.duration,
      }));
      setSteps(s);
      setIdx(0);
    }).catch(() => {});
  }, [origin?.[0], origin?.[1], dest?.[0], dest?.[1]]);

  if (!steps.length) return null;
  const current = steps[idx];

  return (
    <div className="bg-[#13131f]/95 border border-[#252540] rounded-xl p-3 flex flex-col gap-2">
      <div className="text-[10px] font-bold text-[#6b6b8a] uppercase">Navegación</div>
      <p className="text-sm font-semibold text-[#e8e8f4] leading-snug">{current.instruction}</p>
      <div className="flex justify-between text-[10px] text-[#6b6b8a]">
        <span>{Math.round(current.distance)}m</span>
        <span>{idx + 1}/{steps.length}</span>
      </div>
      <div className="flex gap-2">
        <button disabled={idx === 0} onClick={() => setIdx(i => i - 1)} className="flex-1 py-1.5 rounded-lg bg-[#252540] text-[#e8e8f4] text-xs border-0 cursor-pointer disabled:opacity-30">Anterior</button>
        <button disabled={idx >= steps.length - 1} onClick={() => setIdx(i => i + 1)} className="flex-1 py-1.5 rounded-lg bg-[#5b8af9] text-white text-xs border-0 cursor-pointer disabled:opacity-30">Siguiente</button>
      </div>
    </div>
  );
}
