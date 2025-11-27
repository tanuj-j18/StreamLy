/**
 * Comprehensive Logging Utility
 * Provides structured logging with context, timestamps, and error tracking
 */

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

interface LogContext
{
    [key: string]: any;
}

class Logger
{
    private formatMessage(level: LogLevel, message: string, context?: LogContext): string
    {
        const timestamp = new Date().toISOString();
        const contextStr = context ? ` | Context: ${JSON.stringify(context)}` : '';
        return `[${timestamp}] [${level}] ${message}${contextStr}`;
    }

    private log(level: LogLevel, message: string, context?: LogContext)
    {
        const formatted = this.formatMessage(level, message, context);

        switch (level)
        {
            case 'ERROR':
                console.error(formatted);
                break;
            case 'WARN':
                console.warn(formatted);
                break;
            case 'DEBUG':
                if (process.env.NODE_ENV === 'development')
                {
                    console.log(formatted);
                }
                break;
            default:
                console.log(formatted);
        }
    }

    info(message: string, context?: LogContext)
    {
        this.log('INFO', message, context);
    }

    warn(message: string, context?: LogContext)
    {
        this.log('WARN', message, context);
    }

    error(message: string, error?: Error | unknown, context?: LogContext)
    {
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

    debug(message: string, context?: LogContext)
    {
        this.log('DEBUG', message, context);
    }

    // Specialized loggers for different flows
    auth(message: string, context?: LogContext)
    {
        this.info(`[AUTH] ${message}`, context);
    }

    socket(message: string, context?: LogContext)
    {
        this.info(`[SOCKET] ${message}`, context);
    }

    database(message: string, context?: LogContext)
    {
        this.info(`[DB] ${message}`, context);
    }

    kafka(message: string, context?: LogContext)
    {
        this.info(`[KAFKA] ${message}`, context);
    }

    redis(message: string, context?: LogContext)
    {
        this.info(`[REDIS] ${message}`, context);
    }

    mediasoup(message: string, context?: LogContext)
    {
        this.info(`[MEDIASOUP] ${message}`, context);
    }

    api(method: string, path: string, context?: LogContext)
    {
        this.info(`[API] ${method} ${path}`, context);
    }
}

export const logger = new Logger();
export default logger;
