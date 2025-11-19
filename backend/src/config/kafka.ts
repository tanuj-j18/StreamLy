import { Kafka, Producer } from "kafkajs";
import dotenv from 'dotenv';
import prisma from "../utils/prisma";
import { Prisma } from "@prisma/client";
import fs from 'fs';
import logger from "../utils/logger";

dotenv.config({
    path: './.env'
})

// for local development use this
const KAFKA_BROKERS = [process.env.KAFKA_BROKER || 'localhost:9092'];
const kafka = new Kafka({
    clientId: 'chat-kafka',
    brokers: KAFKA_BROKERS, // no SSL
});

//for prod (uncomment and comment above when deploying)
// const kafka = new Kafka({
//   clientId: "chat-kafka",
//   brokers: [process.env.KAFKA_BROKER!],  // e.g. "kafka-xyz.aivencloud.com:12345"
//   ssl: {
//     rejectUnauthorized: true,
//     ca: [fs.readFileSync("./certs/ca.pem", "utf-8")],
//     key: fs.readFileSync("./certs/service.key", "utf-8"),
//     cert: fs.readFileSync("./certs/service.cert", "utf-8"),
//   }
// });




let producer: null | Producer;

export const createProducer = async () =>
{
    if (producer)
    {
        logger.kafka('Using existing Kafka producer');
        return producer;
    }

    try
    {
        logger.kafka('Creating new Kafka producer', { brokers: KAFKA_BROKERS });
        const producer_ = kafka.producer();
        await producer_.connect();
        producer = producer_;
        logger.kafka('✅ Kafka producer connected successfully');
        return producer;
    } catch (error)
    {
        logger.error('Failed to connect Kafka producer', error, {
            action: 'kafka_producer_connect',
            brokers: KAFKA_BROKERS
        });
        throw error;
    }
}

export const produceMessage = async (message: string) =>
{
    try
    {
        const producer = await createProducer();
        const messageKey = `message-${Date.now()}`;

        logger.kafka('Sending message to Kafka', {
            topic: 'MESSAGES',
            messageKey,
            messageLength: message.length
        });

        await producer.send({
            messages: [{ key: messageKey, value: message }],
            topic: "MESSAGES"
        });

        logger.kafka('Message sent to Kafka successfully', { messageKey });
        return true;
    } catch (error)
    {
        logger.error('Failed to send message to Kafka', error, {
            action: 'kafka_produce',
            topic: 'MESSAGES'
        });
        // Don't throw - allow the app to continue without Kafka
        return false;
    }
}

export const startMessageConsumer = async () =>
{
    try
    {
        logger.kafka('Starting Kafka message consumer');

        // Create admin client to create topic if it doesn't exist
        const admin = kafka.admin();
        await admin.connect();
        logger.kafka('Kafka admin client connected');

        // Create topic if it doesn't exist
        try
        {
            await admin.createTopics({
                topics: [{
                    topic: "MESSAGES",
                    numPartitions: 1,
                    replicationFactor: 1,
                }],
            });
            logger.kafka("✅ Kafka topic 'MESSAGES' created or already exists");
        } catch (error: any)
        {
            // Topic might already exist, which is fine
            if (error.code !== 'TOPIC_ALREADY_EXISTS')
            {
                logger.warn('Topic creation note', { error: error.message });
            } else
            {
                logger.kafka('Topic already exists', { topic: 'MESSAGES' });
            }
        }

        await admin.disconnect();
        logger.kafka('Kafka admin client disconnected');

        const consumer = kafka.consumer({ groupId: "chat-consumer-group" });

        logger.kafka('Connecting Kafka consumer', { groupId: 'chat-consumer-group' });
        await consumer.connect();
        await consumer.subscribe({ topic: "MESSAGES", fromBeginning: true });
        logger.kafka('Kafka consumer subscribed to topic', { topic: 'MESSAGES' });

        await consumer.run({
            eachMessage: async ({ topic, partition, message }) =>
            {
                try
                {
                    const messageValue = message.value?.toString();
                    if (!messageValue)
                    {
                        logger.warn('Empty message received from Kafka', {
                            topic,
                            partition
                        });
                        return;
                    }

                    const parsedMessage = JSON.parse(messageValue);
                    const { type, content, mediaUrl, authorId, chatId, callUrl } = parsedMessage;

                    logger.kafka('Processing message from Kafka', {
                        messageId: parsedMessage.id,
                        chatId,
                        authorId,
                        type
                    });

                    //store the message in the db 
                    const savedMessage = await prisma.$transaction(async (tx: Prisma.TransactionClient) =>
                    {
                        // 1. Create the message
                        logger.database('Creating message in database', { chatId, authorId, type });
                        const msg = await tx.messages.create({
                            data: {
                                content,
                                chatId,
                                authorId,
                                mediaUrl,
                                type,
                                callUrl,
                            },
                        });

                        // 2. Decide latestMessage text
                        let latestMessage;
                        if (msg.type === "MEDIA")
                        {
                            latestMessage = "📎 attachment";
                        } else if (msg.type === "CALL")
                        {
                            latestMessage = msg.content === "VOICE" ? "🎙️ voice call" : "🎥 video call";
                        } else if (msg.type === "TEXT")
                        {
                            latestMessage = msg.content;
                        }

                        //update unseen count
                        logger.database('Updating unseen count for participants', { chatId, authorId });
                        await tx.participant.updateMany({
                            where: {
                                chatId,
                                userId: { not: authorId },
                            },
                            data: {
                                unseenCount: { increment: 1 },
                            },
                        });

                        // update latest message
                        logger.database('Updating chat latest message', { chatId, latestMessage });
                        await tx.chat.update({
                            where: { id: chatId },
                            data: {
                                latestMessage: latestMessage!,
                                latestMessageCreatedAt: msg.createdAt,
                            },
                        });

                        return msg;
                    });

                    logger.info('Message saved to database successfully', {
                        messageId: savedMessage.id,
                        chatId,
                        authorId,
                        type
                    });
                } catch (error)
                {
                    logger.error('Error processing Kafka message', error, {
                        action: 'kafka_message_processing',
                        topic,
                        partition
                    });
                }
            },
        });

        logger.kafka("✅ Kafka consumer is listening for messages...");
    } catch (error: any)
    {
        logger.error("Failed to start Kafka consumer", error, {
            action: 'kafka_consumer_start',
            critical: false
        });
        logger.warn("Server will continue without Kafka. Make sure Docker services are running:", {
            instructions: [
                "docker-compose up -d",
                "Wait 30-60 seconds for Kafka to fully start"
            ]
        });
    }
};
