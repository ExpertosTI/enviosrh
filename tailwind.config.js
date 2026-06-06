/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:      '#0b0b14',
        surface: '#13131f',
        card:    '#16162a',
        border:  '#252540',
        primary: { DEFAULT: '#5b8af9', dark: '#3a68e0', light: '#7fa5ff' },
        accent:  '#a78bfa',
        success: '#22c55e',
        warn:    '#f59e0b',
        danger:  '#ef4444',
        ink:     '#e8e8f4',
        muted:   '#6b6b8a',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: { card: '14px', pill: '999px' },
      boxShadow: {
        card:  '0 1px 3px rgba(0,0,0,.4), 0 1px 8px rgba(0,0,0,.2)',
        float: '0 8px 32px rgba(0,0,0,.5)',
        glow:  '0 0 20px rgba(91,138,249,.25)',
      },
      animation: {
        'fade-in':    'fadeIn .18s ease',
        'slide-up':   'slideUp .22s cubic-bezier(.16,1,.3,1)',
        'slide-right':'slideRight .22s cubic-bezier(.16,1,.3,1)',
        'spin-slow':  'spin 1.2s linear infinite',
      },
      keyframes: {
        fadeIn:    { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp:   { from: { opacity: 0, transform: 'translateY(12px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        slideRight:{ from: { opacity: 0, transform: 'translateX(-12px)' }, to: { opacity: 1, transform: 'translateX(0)' } },
      },
    },
  },
  plugins: [],
};
