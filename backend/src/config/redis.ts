import { createClient } from 'redis';
import dotenv from 'dotenv';
import logger from '../utils/logger';

dotenv.config({
  path: './.env'
});

// Use Docker Redis for local development
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

logger.redis('Initializing Redis clients', { url: redisUrl });

export const pubClient = createClient({
  url: redisUrl,
  socket: {
    reconnectStrategy: (retries) =>
    {
      if (retries > 100)
      {
        logger.error('Redis: Taking a long time to connect, continuing to retry...', new Error('Long reconnect'), {
          retries,
          action: 'redis_reconnect'
        });
      }
      // Exponential backoff up to 5 seconds
      const delay = Math.min(retries * 100, 5000);
      logger.debug('Redis reconnecting', { retries, delay });
      return delay;
    },
    connectTimeout: 20000, // 20 seconds
  },
});

export const subClient = pubClient.duplicate();

pubClient.on('error', (err) =>
{
  logger.error('Redis Pub Client Error', err, { action: 'redis_pub_error' });
});

subClient.on('error', (err) =>
{
  logger.error('Redis Sub Client Error', err, { action: 'redis_sub_error' });
});

pubClient.on('connect', () =>
{
  logger.redis('Redis Pub Client connected');
});

subClient.on('connect', () =>
{
  logger.redis('Redis Sub Client connected');
});

pubClient.on('reconnecting', () =>
{
  logger.redis('Redis Pub Client reconnecting');
});

subClient.on('reconnecting', () =>
{
  logger.redis('Redis Sub Client reconnecting');
});

export const connectRedis = async () =>
{
  try
  {
    logger.redis('Attempting to connect to Redis', { url: redisUrl });
    // Add retry logic with delay
    let retries = 0;
    const maxRetries = 5;

    while (retries < maxRetries)
    {
      try
      {
        if (!pubClient.isOpen)
        {
          logger.redis('Connecting pub client', { attempt: retries + 1 });
          await pubClient.connect();
        }
        if (!subClient.isOpen)
        {
          logger.redis('Connecting sub client', { attempt: retries + 1 });
          await subClient.connect();
        }
        logger.redis("✅ Pub Sub Connected successfully!");
        return;
      } catch (error: any)
      {
        retries++;
        if (retries >= maxRetries)
        {
          throw error;
        }
        logger.warn(`Redis connection attempt ${retries}/${maxRetries} failed, retrying in 2 seconds...`, {
          error: error.message,
          attempt: retries,
          maxRetries
        });
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  } catch (error)
  {
    logger.error("Redis connection failed after retries, continuing without Redis", error, {
      action: 'redis_connection',
      critical: false
    });
    // Don't throw - allow server to continue without Redis
  }
}
