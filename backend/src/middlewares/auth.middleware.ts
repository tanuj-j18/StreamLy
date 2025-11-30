import {Request, Response , NextFunction} from 'express';
import jwt, {JwtPayload } from 'jsonwebtoken';
import prisma from '../utils/prisma';
import logger from '../utils/logger';

//defining id as string in jwtpayload as there is no id type in JwtPayload type
interface CustomJwt extends JwtPayload { 
    id : string
}

export const verfiyJWT = async(req : Request , res : Response , next : NextFunction) => {
    // Try cookie first, then Authorization header (for localStorage fallback)
    let token = req.cookies.jwtToken;
    if (!token) {
        const authHeader = req.header("Authorization");
        if (authHeader && authHeader.startsWith("Bearer ")) {
            token = authHeader.split(" ")[1];
        }
    }

    logger.auth('JWT verification attempt', { 
        hasToken: !!token,
        hasAuthHeader: !!req.header("Authorization"),
        hasCookie: !!req.cookies.jwtToken,
        path: req.path
    });

    if(!token){
        logger.warn('JWT verification failed: no token', { path: req.path, ip: req.ip });
        res.status(401).json({
            message : "Incoming Token not found"
        })
        return; 
    }

    try{
        if (!process.env.JWT_SECRET) {
            logger.error('JWT_SECRET not configured', new Error('Missing JWT_SECRET'), {
                action: 'jwt_verify',
                critical: true
            });
            return res.status(500).json({ error: "Server configuration error" });
        }

        const decodedToken : JwtPayload =  jwt.verify(token , process.env.JWT_SECRET) as CustomJwt ;

        logger.database('Fetching user for JWT verification', { userId: decodedToken?.id });
        const existingUser = await prisma.user.findUnique({
            where : {
                id : decodedToken?.id
            }
        });

        if (!existingUser) {
            logger.warn('JWT verification failed: user not found', { userId: decodedToken?.id, path: req.path });
            return res.status(401).json({ error: "User not found" });
        }

        logger.auth('JWT verification successful', { userId: existingUser.id, email: existingUser.email });
        (req as any).user = existingUser;
        next();
    }catch(e: any){
        if (e.name === 'JsonWebTokenError' || e.name === 'TokenExpiredError') {
            logger.warn('JWT verification failed: invalid token', { 
                errorType: e.name,
                path: req.path,
                ip: req.ip
            });
        } else {
            logger.error('JWT verification error', e, { path: req.path, action: 'jwt_verify' });
        }
        res.status(400).json({ error: "Invalid token" });
    }
}
