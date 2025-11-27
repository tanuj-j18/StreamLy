import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import config from '../config';

const s3Client = new S3Client({
    region: config.awsRegion,
    credentials: {
        accessKeyId: config.awsAccessKeyId,
        secretAccessKey: config.awsSecretAccessKey,
    },
});

const BUCKET_NAME = config.awsS3BucketName;

export const uploadToS3 = async (
    file: Buffer,
    key: string,
    contentType: string
): Promise<string> =>
{
    const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: file,
        ContentType: contentType,
    });

    await s3Client.send(command);
    return `https://${BUCKET_NAME}.s3.amazonaws.com/${key}`;
};

export const getSignedUrlForUpload = async (
    key: string,
    expiresIn: number = 3600
): Promise<string> =>
{
    const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
    });

    return await getSignedUrl(s3Client, command, { expiresIn });
};

export const getFileUrl = (key: string): string =>
{
    return `https://${BUCKET_NAME}.s3.amazonaws.com/${key}`;
};

export const generateFileName = (originalName: string): string =>
{
    const timestamp = Date.now();
    const extension = originalName.split('.').pop();
    return `uploads/${timestamp}-${Math.random().toString(36).substring(7)}.${extension}`;
};
