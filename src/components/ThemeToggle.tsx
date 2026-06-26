import { useState, useEffect } from 'react';

type ThemeMode = 'light' | 'dark' | 'system';

function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return mode;
}

function applyTheme(mode: ThemeMode) {
  const resolved = resolveTheme(mode);
  if (resolved === 'dark') document.documentElement.classList.add('dark');
  else document.documentElement.classList.remove('dark');
  window.dispatchEvent(new Event('themechange'));
}

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
    return 'system';
  });

  const resolved = resolveTheme(mode);

  useEffect(() => {
    applyTheme(mode);
    localStorage.setItem('theme', mode);
  }, [mode]);

  useEffect(() => {
    if (mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [mode]);

  const cycle = () => {
    setMode((prev) => (prev === 'light' ? 'dark' : prev === 'dark' ? 'system' : 'light'));
  };

  const label = mode === 'system' ? `Sistema (${resolved})` : mode === 'light' ? 'Claro' : 'Oscuro';

  return (
    <button
      onClick={cycle}
      type="button"
      className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-[#6b6b8a] dark:hover:text-[#e8e8f4] dark:hover:bg-[#252540]/60 transition-colors flex items-center justify-center border-0 bg-transparent cursor-pointer"
      title={`Tema: ${label}`}
      aria-label={`Tema actual: ${label}. Clic para cambiar.`}
    >
      {mode === 'system' ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
        </svg>
      ) : resolved === 'light' ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
