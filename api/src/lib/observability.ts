type LogLevel = 'info' | 'warn' | 'error';

interface LogMeta {
  [key: string]: unknown;
}

export function log(level: LogLevel, message: string, meta?: LogMeta) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    service: 'enviosrh-api',
    ...meta,
  };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export function captureException(err: unknown, context?: LogMeta) {
  log('error', err instanceof Error ? err.message : String(err), {
    stack: err instanceof Error ? err.stack : undefined,
    ...context,
  });
  const dsn = process.env.SENTRY_DSN;
  if (dsn) {
    fetch(`https://sentry.io/api/0/envelope/`, { method: 'POST' }).catch(() => {});
  }
}

export function metricsIncrement(name: string, value = 1) {
  log('info', 'metric', { metric: name, value });
}
