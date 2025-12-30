/**
 * Frontend Logging Utility
 * Provides structured logging with context for debugging
 */

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

interface LogContext {
  [key: string]: any;
}

class Logger {
  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` | Context: ${JSON.stringify(context)}` : '';
    return `[${timestamp}] [${level}] ${message}${contextStr}`;
  }

  private log(level: LogLevel, message: string, context?: LogContext) {
    if (process.env.NODE_ENV === 'production' && level === 'DEBUG') {
      return; // Don't log debug in production
    }

    const formatted = this.formatMessage(level, message, context);
    
    switch (level) {
      case 'ERROR':
        console.error(formatted);
        break;
      case 'WARN':
        console.warn(formatted);
        break;
      case 'DEBUG':
        console.log(formatted);
        break;
      default:
        console.log(formatted);
    }
  }

  info(message: string, context?: LogContext) {
    this.log('INFO', message, context);
  }

  warn(message: string, context?: LogContext) {
    this.log('WARN', message, context);
  }

  error(message: string, error?: Error | unknown, context?: LogContext) {
    const errorContext = {
      ...context,
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : error
    };
    this.log('ERROR', message, errorContext);
  }

  debug(message: string, context?: LogContext) {
    this.log('DEBUG', message, context);
  }

  // Specialized loggers
  auth(message: string, context?: LogContext) {
    this.info(`[AUTH] ${message}`, context);
  }

  api(message: string, context?: LogContext) {
    this.info(`[API] ${message}`, context);
  }

  socket(message: string, context?: LogContext) {
    this.info(`[SOCKET] ${message}`, context);
  }

  mediasoup(message: string, context?: LogContext) {
    this.info(`[MEDIASOUP] ${message}`, context);
  }
}

export const logger = new Logger();
export default logger;
