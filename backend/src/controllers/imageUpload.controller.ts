import { Request, Response } from "express";
import prisma from "../utils/prisma";
import { postObjectUrl, getObjectUrl } from "../utils/s3upload";
import crypto from "crypto";
import logger from "../utils/logger";


export const uploadProfilePic = async (req: Request, res: Response) =>
{
    const { id } = req.params;
    const userId = Array.isArray(id) ? id[0] : id;
    const { fileType } = req.query;

    logger.api('GET', '/upload-profile-pic', { userId, fileType });

    if (!userId)
    {
        logger.warn('uploadProfilePic: missing userId', { params: req.params });
        return res.status(400).json({
            message: "User ID is required"
        });
    }

    try
    {
        logger.info('Generating presigned URL for profile pic', { userId, fileType });
        const url = await postObjectUrl('/profile_pic/', `profile_pic_${userId}`, fileType as string);

        logger.info('Presigned URL generated successfully', { userId });
        res.status(200).json({
            message: "Url fetched successfully",
            url: url
        })
    } catch (error)
    {
        logger.error('Error generating presigned URL', error, { userId, action: 'uploadProfilePic' });
        res.status(400).json({
            message: "Something went wrong while fetching the url"
        });
    }
}

export const getPresignedUrl = async (req: Request, res: Response) =>
{
    const fileType = req.query.fileType || "image/jpeg";

    logger.api('GET', '/get-presigned-url', { fileType });

    try
    {
        const parsedFileType = String(fileType);
        const extension = parsedFileType.split("/")[1] || "jpeg";
        const fileName = `${crypto.randomUUID()}.${extension}`;

        logger.info('Generating presigned URL for chat image', { fileName, fileType });
        const url = await postObjectUrl('/chat_pics/', `${fileName}`, fileType as string);

        logger.info('Presigned URL generated successfully', { fileName });
        res.status(200).send({
            message: "Url fetched successfully",
            url: url,
            key: "/chat_pics/" + fileName
        });
    } catch (error)
    {
        logger.error('Error generating presigned URL', error, { fileType, action: 'getPresignedUrl' });
        res.status(500).send({
            message: "Something went wrong while getting presigned url"
        })
    }
}


export const getProfilePic = async (req: Request, res: Response) =>
{
    const { id } = req.params;
    const userId = Array.isArray(id) ? id[0] : id;

    logger.api('GET', '/get-profile-pic', { userId });

    if (!userId)
    {
        logger.warn('getProfilePic: missing userId', { params: req.params });
        return res.status(400).json({
            message: "User ID is required"
        });
    }

    try
    {
        logger.info('Fetching profile picture URL', { userId });
        
        try {
            const imageUrl = await getObjectUrl(`/profile_pic/profile_pic_${userId}`);

            logger.database('Updating user imageUrl in database', { userId });
            //update the image in the database with every get object call
            await prisma.user.update({
                where: {
                    id: userId
                },
                data: {
                    imageUrl
                }
            });

            logger.info('Profile picture URL fetched successfully', { userId });
            // Sending image url 
            res.status(201).json({
                message: "Successfully fetched the imageUrl",
                url: imageUrl
            });
        } catch (s3Error: any) {
            // If S3 is not configured, return null instead of crashing
            logger.warn('S3 not configured, returning null imageUrl', { 
                userId, 
                error: s3Error.message 
            });
            
            res.status(200).json({
                message: "S3 not configured",
                url: null
            });
        }

    } catch (error)
    {
        logger.error('Error fetching profile picture URL', error, { userId, action: 'getProfilePic' });
        res.status(500).json({ error: "Failed to fetch profile picture" });
    }
};
