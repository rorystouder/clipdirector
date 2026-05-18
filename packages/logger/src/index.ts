import pino, { type Logger as PinoLogger, type LoggerOptions } from 'pino';

export type ServiceName = 'api-gateway' | 'orchestrator' | 'render-worker' | 'queue-client' | 'storage-client';

export interface LogContext {
  jobId?: string;
  userId?: string;
  [key: string]: unknown;
}

export interface Logger {
  trace(ctx: LogContext | string, msg?: string): void;
  debug(ctx: LogContext | string, msg?: string): void;
  info(ctx: LogContext | string, msg?: string): void;
  warn(ctx: LogContext | string, msg?: string): void;
  error(ctx: LogContext | string, msg?: string): void;
  fatal(ctx: LogContext | string, msg?: string): void;
  child(bindings: LogContext): Logger;
}

const baseOptions: LoggerOptions = {
  level: process.env.LOG_LEVEL ?? 'info',
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: undefined,
};

export function createLogger(service: ServiceName): Logger {
  const root: PinoLogger = pino(baseOptions).child({ service });
  return wrap(root);
}

function wrap(logger: PinoLogger): Logger {
  const call =
    (method: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal') =>
    (ctxOrMsg: LogContext | string, msg?: string): void => {
      if (typeof ctxOrMsg === 'string') {
        logger[method](ctxOrMsg);
      } else {
        logger[method](ctxOrMsg, msg);
      }
    };

  return {
    trace: call('trace'),
    debug: call('debug'),
    info: call('info'),
    warn: call('warn'),
    error: call('error'),
    fatal: call('fatal'),
    child: (bindings) => wrap(logger.child(bindings)),
  };
}
