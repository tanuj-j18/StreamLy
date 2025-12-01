import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';

export interface AppError extends Error
{
    statusCode?: number;
    isOperational?: boolean;
}

export class CustomError extends Error implements AppError
{
    statusCode: number;
    isOperational: boolean;

    constructor(message: string, statusCode: number = 500, isOperational: boolean = true)
    {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;

        Error.captureStackTrace(this, this.constructor);
    }
}

// Error types
export class ValidationError extends CustomError
{
    constructor(message: string = 'Validation failed')
    {
        super(message, 400);
    }
}

export class AuthenticationError extends CustomError
{
    constructor(message: string = 'Authentication failed')
    {
        super(message, 401);
    }
}

export class AuthorizationError extends CustomError
{
    constructor(message: string = 'Access denied')
    {
        super(message, 403);
    }
}

export class NotFoundError extends CustomError
{
    constructor(message: string = 'Resource not found')
    {
        super(message, 404);
    }
}

export class ConflictError extends CustomError
{
    constructor(message: string = 'Resource already exists')
    {
        super(message, 409);
    }
}

export class RateLimitError extends CustomError
{
    constructor(message: string = 'Too many requests')
    {
        super(message, 429);
    }
}

export class InternalServerError extends CustomError
{
    constructor(message: string = 'Internal server error')
    {
        super(message, 500, false);
    }
}

// Prisma error handler
const handlePrismaError = (error: Prisma.PrismaClientKnownRequestError): CustomError =>
{
    switch (error.code)
    {
        case 'P2002':
            // Unique constraint violation
            const target = error.meta?.target as string[] || ['field'];
            return new ConflictError(`${target.join(', ')} already exists`);

        case 'P2025':
            // Record not found
            return new NotFoundError('Record not found');

        case 'P2003':
            // Foreign key constraint violation
            return new ValidationError('Invalid reference to related record');

        case 'P2014':
            // Invalid relation
            return new ValidationError('Invalid relation in the data provided');

        default:
            return new InternalServerError('Database operation failed');
    }
};

// JWT error handler
const handleJWTError = (error: Error): CustomError =>
{
    if (error.name === 'JsonWebTokenError')
    {
        return new AuthenticationError('Invalid token');
    }
    if (error.name === 'TokenExpiredError')
    {
        return new AuthenticationError('Token expired');
    }
    return new AuthenticationError('Authentication failed');
};

// Global error handler middleware
export const errorHandler = (
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction
): void =>
{
    let customError: CustomError;

    // Handle different error types
    if (error instanceof CustomError)
    {
        customError = error;
    } else if (error instanceof Prisma.PrismaClientKnownRequestError)
    {
        customError = handlePrismaError(error);
    } else if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError')
    {
        customError = handleJWTError(error);
    } else if (error.name === 'ValidationError')
    {
        customError = new ValidationError(error.message);
    } else
    {
        customError = new InternalServerError();
    }

    // Log error for debugging (in production, use proper logging service)
    if (!customError.isOperational)
    {
        console.error('Unhandled error:', {
            message: error.message,
            stack: error.stack,
            url: req.url,
            method: req.method,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            timestamp: new Date().toISOString()
        });
    }

    // Send error response
    res.status(customError.statusCode).json({
        success: false,
        error: customError.message,
        ...(process.env.NODE_ENV === 'development' && {
            stack: customError.stack,
            details: error
        })
    });
};

// Async error wrapper
export const asyncHandler = (fn: Function) =>
{
    return (req: Request, res: Response, next: NextFunction) =>
    {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

// 404 handler
export const notFoundHandler = (req: Request, res: Response): void =>
{
    res.status(404).json({
        success: false,
        error: `Route ${req.originalUrl} not found`
    });
};
