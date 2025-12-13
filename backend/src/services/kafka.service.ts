import { Kafka, Producer, Consumer } from 'kafkajs';
import config from '../config';

class KafkaService
{
    private kafka: Kafka;
    private producer: Producer;
    private consumer: Consumer;

    constructor()
    {
        this.kafka = new Kafka({
            clientId: config.kafkaClientId,
            brokers: [config.kafkaBroker],
            retry: {
                initialRetryTime: 100,
                retries: 8
            }
        });

        this.producer = this.kafka.producer({
            maxInFlightRequests: 1,
            idempotent: true,
            transactionTimeout: 30000
        });

        this.consumer = this.kafka.consumer({
            groupId: 'streamly-consumer-group',
            sessionTimeout: 30000,
            heartbeatInterval: 3000
        });
    }

    async connect(): Promise<void>
    {
        try
        {
            await this.producer.connect();
            await this.consumer.connect();
            console.log('Kafka connected successfully');
        } catch (error)
        {
            console.error('Kafka connection error:', error);
            throw error;
        }
    }

    async disconnect(): Promise<void>
    {
        try
        {
            await this.producer.disconnect();
            await this.consumer.disconnect();
            console.log('Kafka disconnected successfully');
        } catch (error)
        {
            console.error('Kafka disconnection error:', error);
            throw error;
        }
    }

    async publishMessage(topic: string, message: any): Promise<void>
    {
        try
        {
            await this.producer.send({
                topic,
                messages: [
                    {
                        key: message.chatId || 'default',
                        value: JSON.stringify(message),
                        timestamp: Date.now().toString()
                    }
                ]
            });
            console.log(`Message published to topic ${topic}:`, message);
        } catch (error)
        {
            console.error('Kafka publish error:', error);
            throw error;
        }
    }

    async subscribeToTopic(topic: string, callback: (message: any) => Promise<void>): Promise<void>
    {
        try
        {
            await this.consumer.subscribe({ topic, fromBeginning: false });

            await this.consumer.run({
                eachMessage: async ({ topic, partition, message }) =>
                {
                    try
                    {
                        const messageValue = message.value?.toString();
                        if (messageValue)
                        {
                            const parsedMessage = JSON.parse(messageValue);
                            await callback(parsedMessage);
                        }
                    } catch (error)
                    {
                        console.error('Error processing Kafka message:', error);
                    }
                }
            });
            console.log(`Subscribed to Kafka topic: ${topic}`);
        } catch (error)
        {
            console.error('Kafka subscription error:', error);
            throw error;
        }
    }

    // Specific methods for StreamLy messaging
    async publishChatMessage(messageData: any): Promise<void>
    {
        await this.publishMessage('chat-messages', {
            type: 'NEW_MESSAGE',
            data: messageData,
            timestamp: new Date().toISOString()
        });
    }

    async publishUserActivity(userData: any): Promise<void>
    {
        await this.publishMessage('user-activity', {
            type: 'USER_ACTIVITY',
            data: userData,
            timestamp: new Date().toISOString()
        });
    }

    async publishFileUpload(fileData: any): Promise<void>
    {
        await this.publishMessage('file-uploads', {
            type: 'FILE_UPLOADED',
            data: fileData,
            timestamp: new Date().toISOString()
        });
    }
}

export const kafkaService = new KafkaService();
export default kafkaService;
