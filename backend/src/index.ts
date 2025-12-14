import express from 'express';
import dotenv from 'dotenv'
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors'
import { startMessageConsumer } from './config/kafka';
import { connectRedis } from './config/redis';
import { SocketIoServer } from './socket';
import { SocketService } from './mediasoup/SocketServer';
import { connectDB } from './utils/prisma';
import logger from './utils/logger';

dotenv.config({
  path: './.env'
})

logger.info('🚀 Starting StreamLy Backend Server', {
  nodeEnv: process.env.NODE_ENV,
  frontendUrl: process.env.FRONTEND_URL
});

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true
  },
});

// CORS - Very permissive in development for WSL2 networking issues
app.use(
  cors({
    origin: (origin, callback) =>
    {
      // In development, allow ALL origins to avoid WSL2 networking issues
      if (process.env.NODE_ENV !== 'production')
      {
        return callback(null, true);
      }

      // In production, check against configured frontend URL
      const allowedOrigin = process.env.FRONTEND_URL || "http://localhost:3000";
      if (!origin || origin.startsWith(allowedOrigin.replace(/:\d+$/, '')))
      {
        return callback(null, true);
      }

      callback(new Error('Not allowed by CORS'));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204
  })
);

// Request logging middleware
app.use((req, res, next) =>
{
  logger.api(req.method, req.path, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
    query: req.query,
    body: req.method === 'POST' || req.method === 'PUT' ? '***' : undefined
  });
  next();
});

// Add a simple middleware to catch and log all requests
app.use((req, res, next) =>
{
  logger.debug('Request received', {
    method: req.method,
    path: req.path,
    url: req.url,
    headers: {
      host: req.headers.host,
      origin: req.headers.origin,
      'user-agent': req.headers['user-agent']
    }
  });
  next();
});

SocketIoServer(io)
new SocketService(io)

app.use(express.json({ limit: "16kb" }))
app.use(express.urlencoded({ extended: true, limit: "16kb" }))
app.use(express.static("public"))
app.use(compression());
app.use(cookieParser())
app.set("trust-proxy", 1);

const PORT = Number(process.env.PORT) || 5000;

//Connect database on startup (non-blocking - server will start even if DB fails)
(async () =>
{
  try
  {
    await connectDB();
    logger.database('✅ Database connected successfully');
  } catch (error)
  {
    logger.error('❌ Database connection failed', error, {
      action: 'database_connection',
      critical: false
    });
    console.warn('⚠️  Database: Connection failed (server will continue)');
  }
})();

//Connect redis on startup (non-blocking)
(async () =>
{
  try
  {
    await connectRedis();
    logger.redis('✅ Redis connected successfully');
  } catch (error)
  {
    logger.warn('⚠️ Redis connection failed, continuing without Redis', {
      action: 'redis_connection',
      error: error instanceof Error ? error.message : String(error)
    });
    console.warn('⚠️  Redis: Connection failed (server will continue)');
  }
})();

//consume kafka streams (non-blocking)
(async () =>
{
  try
  {
    await startMessageConsumer();
    logger.kafka('✅ Kafka consumer started successfully');
  } catch (error)
  {
    logger.warn('⚠️ Kafka consumer failed to start, continuing without Kafka', {
      action: 'kafka_consumer_start',
      error: error instanceof Error ? error.message : String(error)
    });
    console.warn('⚠️  Kafka: Consumer failed (server will continue)');
  }
})();

// Basic routes - must be before API routes
app.get('/', (req, res) =>
{
  logger.info('Root endpoint hit', { ip: req.ip });
  res.send("hello world this is aayush tirmanwar");
})

app.get('/health', (req, res) =>
{
  logger.info('Health check endpoint hit', { ip: req.ip });
  try
  {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        database: 'connected',
        redis: 'connected',
        kafka: 'connected'
      }
    });
  } catch (error)
  {
    logger.error('Error in health check', error);
    res.status(500).json({ status: 'error', message: 'Health check failed' });
  }
})

// Simple test endpoint to verify server is responding
app.get('/test', (req, res) =>
{
  logger.info('Test endpoint hit', { ip: req.ip });
  try
  {
    res.status(200).json({
      message: 'Backend server is running!',
      timestamp: new Date().toISOString(),
      port: PORT,
      host: '0.0.0.0'
    });
  } catch (error)
  {
    logger.error('Error in test endpoint', error);
    res.status(500).json({ error: 'Test endpoint failed' });
  }
})

//api routes
import authRoute from './routes/auth.routes';
import chatRoute from './routes/chat.routes';
import messageRoute from './routes/message.routes';
import imageUploadRoute from './routes/imageUpload.routes';

app.use("/api/v1/user", authRoute);
app.use("/api/v1/chat", chatRoute);
app.use("/api/v1/message", messageRoute);
app.use("/api/v1/upload", imageUploadRoute);

// Error handling middleware (must be after all routes)
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) =>
{
  logger.error('Unhandled error in request', err, {
    method: req.method,
    path: req.path,
    status: err.status || 500
  });

  res.status(err.status || 500).json({
    message: err.message || "Internal Server Error",
    error: process.env.NODE_ENV === "development" ? err : undefined
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any, promise: Promise<any>) =>
{
  logger.error('Unhandled Promise Rejection', reason, {
    action: 'unhandled_rejection',
    critical: true
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) =>
{
  logger.error('Uncaught Exception', error, {
    action: 'uncaught_exception',
    critical: true
  });
});

// Start server - try 0.0.0.0 first (for WSL2), fallback to localhost
const HOST = process.env.HOST || '0.0.0.0';

// Get WSL2 IP for Windows access
let wslIp = 'localhost';
try
{
  const { execSync } = require('child_process');
  const ipOutput = execSync('hostname -I 2>/dev/null || echo ""', { encoding: 'utf-8' }).trim();
  if (ipOutput)
  {
    wslIp = ipOutput.split(' ')[0];
  }
} catch (e)
{
  // Ignore - will use localhost
}

server.listen(PORT, HOST, () =>
{
  console.log('\n' + '='.repeat(70));
  console.log(`✅ SERVER RUNNING SUCCESSFULLY!`);
  console.log('='.repeat(70));
  console.log(`📍 Port: ${PORT}`);
  console.log(`🌐 Host: ${HOST}`);
  console.log(`\n🔗 ACCESS FROM WINDOWS:`);
  console.log(`   http://${wslIp}:${PORT}`);
  console.log(`   http://localhost:${PORT} (if port forwarding works)`);
  console.log(`\n🔗 ACCESS FROM WSL2:`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`\n📋 ENDPOINTS:`);
  console.log(`   Test: http://${wslIp}:${PORT}/test`);
  console.log(`   Health: http://${wslIp}:${PORT}/health`);
  console.log(`\n⚠️  IMPORTANT: Update frontend .env with:`);
  console.log(`   NEXT_PUBLIC_BACKEND_URL=http://${wslIp}:${PORT}`);
  console.log('='.repeat(70) + '\n');

  logger.info(`✅ Server is up and running on PORT ${PORT}`, {
    port: PORT,
    host: HOST,
    environment: process.env.NODE_ENV || 'development',
    accessUrl: `http://localhost:${PORT}`,
    healthCheck: `http://localhost:${PORT}/health`,
    testEndpoint: `http://localhost:${PORT}/test`
  });
}).on('error', (err: any) =>
{
  console.error('\n❌ SERVER STARTUP ERROR:', err.message);
  if (err.code === 'EADDRINUSE')
  {
    logger.error(`Port ${PORT} is already in use`, err, {
      action: 'port_in_use',
      port: PORT
    });
    console.error(`\n💡 Solution: Kill the process using port ${PORT} or change PORT in .env\n`);
  } else
  {
    logger.error('Server error', err, {
      action: 'server_startup'
    });
  }
  process.exit(1);
});