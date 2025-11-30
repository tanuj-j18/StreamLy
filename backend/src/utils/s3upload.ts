import { S3Client , PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import dotenv from 'dotenv';

dotenv.config({
    path : './.env'
});

//importing the env variables as string because typescript imports env variables as string | undefined
// Only create S3 client if credentials are available
let s3: S3Client | null = null;

if ((process.env.AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY) && process.env.AWS_SECRET_ACCESS_KEY) {
    s3 = new S3Client({
        region : process.env.AWS_REGION || "ap-south-1",
        credentials : {
            accessKeyId : (process.env.AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY)!,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        }
    });
} else {
    console.warn('⚠️  AWS S3 credentials not configured. Image upload features will not work.');
}

//using the presignedUrl approach 
export async function postObjectUrl(dirname : string , filename : string , contentType : string ){
    if (!s3) {
        throw new Error('AWS S3 is not configured. Please set AWS_ACCESS_KEY and AWS_SECRET_ACCESS_KEY in .env');
    }
    
    //sending an api request to aws 
    const params = { 
        Bucket: process.env.AWS_S3_BUCKET_NAME || process.env.BUCKET_NAME || process.env.NEXT_PUBLIC_BUCKET_NAME || "tiru-chatapp",
        Key : dirname + filename , 
        ContentType : contentType
    }

    //link expires after 2 mins 
    const expiresIn = 120 

    const url = await getSignedUrl(s3 , new PutObjectCommand(params ) , { expiresIn });
    return url ;
}

export const getObjectUrl = async( key : string) => {
    if (!s3) {
        throw new Error('AWS S3 is not configured. Please set AWS_ACCESS_KEY and AWS_SECRET_ACCESS_KEY in .env');
    }
    
    const params = {
        Bucket : process.env.AWS_S3_BUCKET_NAME || process.env.BUCKET_NAME || process.env.NEXT_PUBLIC_BUCKET_NAME || 'tiru-chatapp',
        Key : key 
    }

    const url = await getSignedUrl(s3 , new GetObjectCommand(params))
    return url ;
}
