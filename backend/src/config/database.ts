import prisma from '../utils/prisma';

export const connectDatabase = async (): Promise<void> =>
{
    try
    {
        await prisma.$connect();
        console.log('✅ Database connected successfully');
    } catch (error)
    {
        console.error('❌ Database connection failed:', error);
        throw error;
    }
};

export const disconnectDatabase = async (): Promise<void> =>
{
    try
    {
        await prisma.$disconnect();
        console.log('✅ Database disconnected successfully');
    } catch (error)
    {
        console.error('❌ Database disconnection failed:', error);
        throw error;
    }
};

export const testDatabaseConnection = async (): Promise<boolean> =>
{
    try
    {
        await prisma.$queryRaw`SELECT 1`;
        return true;
    } catch (error)
    {
        console.error('Database connection test failed:', error);
        return false;
    }
};

// Health check function
export const getDatabaseHealth = async () =>
{
    try
    {
        const startTime = Date.now();
        await prisma.$queryRaw`SELECT 1`;
        const endTime = Date.now();

        return {
            status: 'healthy',
            latency: `${endTime - startTime}ms`,
            timestamp: new Date().toISOString()
        };
    } catch (error)
    {
        return {
            status: 'unhealthy',
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        };
    }
};
