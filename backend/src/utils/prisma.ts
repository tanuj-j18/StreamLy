import { PrismaClient } from "@prisma/client";
import logger from "./logger";

class PrismaInstance {
    private static instance: PrismaClient;

    private constructor() {}

    public static getInstance(): PrismaClient {
        if (!PrismaInstance.instance) {
            logger.database('Creating Prisma client instance');
            PrismaInstance.instance = new PrismaClient({
                log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
            });
        }
        return PrismaInstance.instance;
    }
}

const prisma = PrismaInstance.getInstance();

export const connectDB = async () => {
    try {
        logger.database('Connecting to database');
        await prisma.$connect();
        logger.database('✅ Database connected successfully');
    } catch (error) {
        logger.error('Database connection failed', error, {
            action: 'database_connection',
            critical: true
        });
        throw error;
    }
};

export const disconnectDB = async () => {
    try {
        logger.database('Disconnecting from database');
        await prisma.$disconnect();
        logger.database('Database disconnected successfully');
    } catch (error) {
        logger.error('Error disconnecting from database', error, {
            action: 'database_disconnect'
        });
    }
};

export default prisma;
