/**
 * Simple structured logger with configurable log levels.
 *
 * Set LOG_LEVEL environment variable to control verbosity:
 * - 'debug': All logs (debug, info, warn, error)
 * - 'info': Info and above (default)
 * - 'warn': Warnings and errors only
 * - 'error': Errors only
 * - 'silent': No logs
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent'

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4
}

// Cache log level at module load time (won't change during runtime)
const ENV_LOG_LEVEL = process.env['LOG_LEVEL']?.toLowerCase() as LogLevel | undefined
const CURRENT_LOG_LEVEL: LogLevel =
  ENV_LOG_LEVEL !== undefined && LOG_LEVELS[ENV_LOG_LEVEL] !== undefined
    ? ENV_LOG_LEVEL
    : 'info'

const shouldLog = (level: LogLevel): boolean => {
  return LOG_LEVELS[level] >= LOG_LEVELS[CURRENT_LOG_LEVEL]
}

const formatTimestamp = (): string => {
  return new Date().toISOString()
}

const formatMessage = (level: string, context: string, message: string): string => {
  return `[${formatTimestamp()}] [${level.toUpperCase()}] [${context}] ${message}`
}

export const createLogger = (context: string) => ({
  debug: (message: string, ...args: unknown[]) => {
    if (shouldLog('debug')) {
      console.log(formatMessage('debug', context, message), ...args)
    }
  },
  info: (message: string, ...args: unknown[]) => {
    if (shouldLog('info')) {
      console.log(formatMessage('info', context, message), ...args)
    }
  },
  warn: (message: string, ...args: unknown[]) => {
    if (shouldLog('warn')) {
      console.warn(formatMessage('warn', context, message), ...args)
    }
  },
  error: (message: string, ...args: unknown[]) => {
    if (shouldLog('error')) {
      console.error(formatMessage('error', context, message), ...args)
    }
  }
})

// Default logger for general use
export const logger = createLogger('server')
