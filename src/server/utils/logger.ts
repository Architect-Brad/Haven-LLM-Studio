import pino from 'pino';

const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

const logger = pino({
  level: process.env.HAVEN_LOG_LEVEL || (isDev ? 'debug' : 'info'),
  ...(isDev
    ? {
        transport: {
          target: 'pino/file',
          options: { destination: 1 },
        },
      }
    : {}),
});

export function createLogger(component: string): pino.Logger {
  return logger.child({ component });
}

export default logger;
