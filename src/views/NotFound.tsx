import { useNavigate } from 'react-router-dom';

export function NotFound() {
  const nav = useNavigate();
  return (
    <div className="min-h-screen bg-[#0b0b14] flex flex-col items-center justify-center text-center px-6 gap-8">
      {/* Animated icon */}
      <div className="relative">
        <div className="w-32 h-32 rounded-3xl bg-[#5b8af9]/10 border border-[#5b8af9]/20 flex items-center justify-center">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#5b8af9" strokeWidth="1.5">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
            <polyline points="9,22 9,12 15,12 15,22"/>
          </svg>
        </div>
        <div className="absolute -top-2 -right-2 w-8 h-8 rounded-xl bg-[#ef4444]/15 border border-[#ef4444]/30 flex items-center justify-center animate-bounce">
          <span className="text-[#ef4444] font-extrabold text-xs">!</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="text-7xl font-black text-white tracking-tight">
          4<span className="text-[#5b8af9]">0</span>4
        </h1>
        <p className="text-lg font-bold text-[#e8e8f4]">Página no encontrada</p>
        <p className="text-sm text-[#6b6b8a] max-w-xs leading-relaxed">
          La ruta que buscas no existe o fue movida. Regresa al panel principal.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => nav(-1)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#13131f] border border-[#252540] text-[#e8e8f4] text-sm font-bold hover:border-[#5b8af9]/40 transition-all cursor-pointer"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
          Volver
        </button>
        <button
          onClick={() => nav('/')}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#5b8af9] text-white text-sm font-extrabold hover:bg-[#3a68e0] transition-all cursor-pointer border-0 shadow-lg shadow-[#5b8af9]/25"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
          </svg>
          Ir al inicio
        </button>
      </div>

      <p className="text-[10px] text-[#3a3a58] font-medium">
        Envíos App <span className="text-[#5b8af9]">by Renace.tech</span>
      </p>
    </div>
  );
}
