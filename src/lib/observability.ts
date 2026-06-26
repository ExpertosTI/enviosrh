export function initObservability() {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  window.addEventListener('error', (e) => {
    console.error(JSON.stringify({
      ts: new Date().toISOString(),
      level: 'error',
      service: 'enviosrh-web',
      message: e.message,
      sentry: !!dsn,
    }));
  });
  window.addEventListener('unhandledrejection', (e) => {
    console.error(JSON.stringify({
      ts: new Date().toISOString(),
      level: 'error',
      service: 'enviosrh-web',
      message: String(e.reason),
      sentry: !!dsn,
    }));
  });
}
