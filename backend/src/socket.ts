import { Server } from "socket.io";
import { Socket } from "socket.io";
import { ChatSocketType } from "./utils/enums";
import { produceMessage } from "./config/kafka";
import { pubClient, subClient } from "./config/redis";
import logger from "./utils/logger";

const subscribedChats = new Set<string>(); // to avoid duplicate subscriptions

export const SocketIoServer = (io: Server) =>
{
  logger.socket('Socket.IO server initialized');

  io.on("connection", (socket: Socket) =>
  {
    logger.socket('New socket connection', { socketId: socket.id });

    socket.on(ChatSocketType.JOIN_CHAT, (id: string) =>
    {
      //id is chatId here 
      if (!id)
      {
        logger.warn('JOIN_CHAT: missing chatId', { socketId: socket.id });
        return;
      }

      socket.join(id);
      logger.socket('User joined chat room', { socketId: socket.id, chatId: id });

      if (!subscribedChats.has(id))
      {
        try
        {
          subClient.subscribe(id, (message: string) =>
          {
            try
            {
              const parsed = JSON.parse(message);
              logger.redis('Received message from Redis', { chatId: id, messageId: parsed.id });
              io.to(id).emit("new-message", parsed);
            } catch (error)
            {
              logger.error('Error parsing Redis message', error, {
                chatId: id,
                action: 'redis_message_parse'
              });
            }
          });
          subscribedChats.add(id);
          logger.redis('Subscribed to Redis channel', { chatId: id, socketId: socket.id });
        } catch (error)
        {
          logger.error('Error subscribing to Redis channel', error, {
            chatId: id,
            socketId: socket.id,
            action: 'redis_subscribe'
          });
        }
      } else
      {
        logger.debug('Already subscribed to Redis channel', { chatId: id });
      }
    });

    socket.on(ChatSocketType.SEND_MESSAGE, async (messageData: any) =>
    {
      const { chatId } = messageData;

      if (!chatId)
      {
        logger.warn('SEND_MESSAGE: missing chatId', { socketId: socket.id, messageData });
        return;
      }

      logger.socket('Message received via socket', {
        socketId: socket.id,
        chatId,
        messageId: messageData.id,
        type: messageData.type
      });

      try
      {
        //produce in the kafka queue
        const kafkaSuccess = await produceMessage(JSON.stringify(messageData));
        if (kafkaSuccess)
        {
          logger.kafka('Message sent to Kafka', { chatId, messageId: messageData.id });
        } else
        {
          logger.warn('Failed to send message to Kafka, continuing with Redis', { chatId });
        }

        // Also publish to Redis for real-time delivery
        try
        {
          await pubClient.publish(chatId, JSON.stringify(messageData));
          logger.redis('Message published to Redis', { chatId, messageId: messageData.id });
        } catch (error)
        {
          logger.error('Error publishing to Redis', error, {
            chatId,
            messageId: messageData.id,
            action: 'redis_publish'
          });
        }
      } catch (error)
      {
        logger.error('Error processing message', error, {
          chatId,
          socketId: socket.id,
          action: 'send_message'
        });
      }
    });

    socket.on("disconnect", () =>
    {
      logger.socket('Socket disconnected', { socketId: socket.id });
    });

    socket.on("error", (error) =>
    {
      logger.error('Socket error', error, { socketId: socket.id, action: 'socket_error' });
    });
  })
}
