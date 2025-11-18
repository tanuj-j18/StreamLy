export interface Config
{
    // Server
    port: number;
    nodeEnv: string;
    frontendUrl: string;

    // Database
    databaseUrl: string;

    // JWT
    jwtSecret: string;
    jwtExpiresIn: string;

    // Redis
    redisUrl: string;
    redisPassword?: string;
    redisDb: number;

    // AWS S3
    awsRegion: string;
    awsAccessKeyId: string;
    awsSecretAccessKey: string;
    awsS3BucketName: string;

    // Kafka
    kafkaBroker: string;
    kafkaClientId: string;

    // Socket.IO
    socketCorsOrigin: string;

    // File Upload
    maxFileSize: number;
    allowedFileTypes: string[];

    // Rate Limiting
    rateLimitWindowMs: number;
    rateLimitMaxRequests: number;

    // Logging
    logLevel: string;
    logFile: string;
}

const config: Config = {
    // Server
    port: parseInt(process.env.PORT || '3001', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',

    // Database
    databaseUrl: process.env.DATABASE_URL || '',

    // JWT
    jwtSecret: process.env.JWT_SECRET || 'fallback-secret-change-in-production',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

    // Redis
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
    redisPassword: process.env.REDIS_PASSWORD,
    redisDb: parseInt(process.env.REDIS_DB || '0', 10),

    // AWS S3
    awsRegion: process.env.AWS_REGION || 'us-east-1',
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    awsS3BucketName: process.env.AWS_S3_BUCKET_NAME || 'streamly-uploads',

    // Kafka
    kafkaBroker: process.env.KAFKA_BROKER || 'localhost:9092',
    kafkaClientId: process.env.KAFKA_CLIENT_ID || 'streamly-app',

    // Socket.IO
    socketCorsOrigin: process.env.SOCKET_CORS_ORIGIN || 'http://localhost:3000',

    // File Upload
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '5242880', 10), // 5MB
    allowedFileTypes: (process.env.ALLOWED_FILE_TYPES || 'image/jpeg,image/png,image/gif,application/pdf,video/mp4,audio/mp3').split(','),

    // Rate Limiting
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
    rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),

    // Logging
    logLevel: process.env.LOG_LEVEL || 'info',
    logFile: process.env.LOG_FILE || 'logs/streamly.log'
};

// Validation
if (!config.databaseUrl)
{
    console.warn('⚠️  DATABASE_URL is not set. Database operations will fail.');
}

if (config.jwtSecret === 'fallback-secret-change-in-production' && config.nodeEnv === 'production')
{
    console.error('🚨 JWT_SECRET must be set in production!');
    process.exit(1);
}

if (!config.awsAccessKeyId || !config.awsSecretAccessKey)
{
    console.warn('⚠️  AWS credentials not set. File uploads will fail.');
}

export default config;
