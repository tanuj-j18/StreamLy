import { Request, Response } from "express";
import prisma from "../utils/prisma";
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken';
import logger from "../utils/logger";

export const handleSignUp = async (req: Request, res: Response) =>
{
  const { email, password, name, imageUrl } = req.body;

  logger.auth('Signup attempt', { email, name: name ? 'provided' : 'missing' });

  try
  {
    // Validate input
    if (!email || !password || !name)
    {
      logger.warn('Signup validation failed', { email, hasPassword: !!password, hasName: !!name });
      return res.status(400).json({
        message: "Email, password, and name are required"
      });
    }

    const userExists = await prisma.user.findUnique({
      where: { email }
    });

    if (userExists)
    {
      logger.warn('Signup failed: user already exists', { email });
      return res.status(400).json({
        message: "User with this email already exists"
      });
    }

    logger.database('Hashing password for new user', { email });
    const hashedPassword = await bcrypt.hash(password, 10);

    logger.database('Creating new user in database', { email, name });
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        imageUrl: imageUrl || null
      }
    });

    logger.auth('User created successfully', { userId: user.id, email });
    res.status(201).json({
      message: "User created successfully",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        imageUrl: user.imageUrl
      }
    });
  } catch (error)
  {
    logger.error('Error during user signup', error, { email, action: 'signup' });
    res.status(500).json({
      message: "Something went wrong while registering the user"
    });
  }
};

export const loginHandler = async (req: Request, res: Response) =>
{
  const { email, password } = req.body;

  logger.auth('Login attempt', { email });

  try
  {
    // Validate input
    if (!email || !password)
    {
      logger.warn('Login validation failed', { email: !!email, hasPassword: !!password });
      return res.status(400).json({
        message: "Email and password are required"
      });
    }

    // Check JWT_SECRET
    if (!process.env.JWT_SECRET)
    {
      logger.error('JWT_SECRET not configured', new Error('Missing JWT_SECRET'), {
        action: 'login',
        critical: true
      });
      return res.status(500).json({
        message: "Server configuration error"
      });
    }

    logger.database('Fetching user from database', { email });
    const userExists = await prisma.user.findUnique({
      where: { email }
    });

    if (!userExists)
    {
      logger.warn('Login failed: user not found', { email });
      return res.status(401).json({
        message: "User with this email does not exist"
      });
    }

    logger.auth('Comparing password', { userId: userExists.id });
    const comparePassword = await bcrypt.compare(password, userExists.password);

    if (!comparePassword)
    {
      logger.warn('Login failed: invalid password', { userId: userExists.id, email });
      return res.status(401).json({
        message: "Invalid Password or Email"
      });
    }

    logger.auth('Generating JWT token', { userId: userExists.id });
    const jwtToken = jwt.sign({ id: userExists.id }, process.env.JWT_SECRET);

    // Cookie settings for cross-origin (WSL2 IP vs localhost)
    // Note: Browsers require secure: true with sameSite: 'none', but that needs HTTPS
    // For HTTP development, we'll use sameSite: 'lax' which works for same-site requests
    // The frontend should use the WSL2 IP for both frontend and backend URLs
    const origin = req.headers.origin || '';
    const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1');
    
    const options = {
      httpOnly: true,
      secure: false, // Set to false for HTTP development (change to true in production with HTTPS)
      sameSite: (isLocalhost ? 'lax' : 'none') as 'lax' | 'none',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    };
    
    logger.auth('Setting cookie', { 
      sameSite: options.sameSite, 
      secure: options.secure,
      origin 
    });

    logger.auth('Login successful', { userId: userExists.id, email });
    const responseData = {
      message: "User has been successfully Logged In",
      userId: userExists.id,
      name: userExists.name,
      imageUrl: userExists.imageUrl,
      email: userExists.email
    };
    logger.auth('Sending login response', { 
      hasUserId: !!responseData.userId,
      responseKeys: Object.keys(responseData)
    });
    res.status(200)
      .cookie("jwtToken", jwtToken, options)
      .json(responseData);
  } catch (error)
  {
    logger.error('Error during login', error, { email, action: 'login' });
    res.status(500).json({
      message: "Internal Server Error"
    });
  }
};

//controller to protect routes at the frontend 
export const checkAuth = async (req: Request, res: Response) =>
{
  // Try to get token from cookie first, then from Authorization header (for localStorage fallback)
  let token = req.cookies.jwtToken;
  
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }

  logger.auth('Auth check request', { 
    hasCookieToken: !!req.cookies.jwtToken,
    hasHeaderToken: !!req.headers.authorization,
    hasToken: !!token,
    ip: req.ip,
    authHeader: req.headers.authorization ? 'Bearer ***' : 'none',
    cookieKeys: Object.keys(req.cookies || {})
  });

  if (!token)
  {
    logger.auth('Auth check failed: no token', { ip: req.ip });
    return res.status(200).json({
      message: "Unauthorized User",
      authenticated: false
    });
  }

  try
  {
    if (!process.env.JWT_SECRET)
    {
      logger.error('JWT_SECRET not configured', new Error('Missing JWT_SECRET'), {
        action: 'checkAuth',
        critical: true
      });
      return res.status(500).json({
        message: "Server configuration error",
        authenticated: false
      });
    }

    logger.auth('Verifying JWT token');
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);

    logger.auth('Auth check successful', { userId: (decodedToken as any).id });
    res.status(200).json({
      message: "Authenticated",
      token: decodedToken,
      authenticated: true
    });
  } catch (error: any)
  {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError')
    {
      logger.warn('Auth check failed: invalid token', {
        errorType: error.name,
        ip: req.ip
      });
      return res.status(200).json({
        message: "Unauthorized",
        authenticated: false
      });
    }

    logger.error('Error during auth check', error, { action: 'checkAuth' });
    res.status(500).json({
      message: "Internal Server Error",
      authenticated: false
    });
  }
};

export const logout = (req: Request, res: Response) =>
{
  const token = req.cookies.jwtToken;

  logger.auth('Logout request', { hasToken: !!token, ip: req.ip });

  if (!token)
  {
    logger.warn('Logout failed: no token', { ip: req.ip });
    return res.status(401).json({
      message: "No sign in, no logout",
    });
  }

  try
  {
    if (!process.env.JWT_SECRET)
    {
      logger.error('JWT_SECRET not configured', new Error('Missing JWT_SECRET'), {
        action: 'logout',
        critical: true
      });
      return res.status(500).json({
        message: "Server configuration error"
      });
    }

    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);

    if (decodedToken)
    {
      logger.auth('Logout successful', { userId: (decodedToken as any).id });
      // clear the cookie - must use same options as when it was set
      res.clearCookie("jwtToken", {
        httpOnly: true,
        secure: false,
        sameSite: 'lax' as const,
        path: '/'
      });

      return res.status(200).json({
        message: "Logged out successfully",
      });
    }
  } catch (error: any)
  {
    logger.warn('Logout failed: invalid token', {
      errorType: error.name,
      ip: req.ip
    });
    return res.status(401).json({
      message: "Invalid token",
    });
  }
};

export const getAllUsers = async (req: Request, res: Response) =>
{
  const { id } = req.params;
  const userId: string = Array.isArray(id) ? id[0] : (id as string);

  logger.api('GET', '/getAllUsers', { userId });

  if (!userId)
  {
    logger.warn('getAllUsers: missing userId', { params: req.params });
    return res.status(400).json({
      message: "User ID is required"
    });
  }

  try
  {
    logger.database('Fetching all users', { excludeUserId: userId });
    const users = await prisma.user.findMany({
      where: {
        id: { not: userId }
      },
      select: {
        id: true,
        name: true,
        email: true,
        imageUrl: true
      }
    });

    logger.database('Fetching user chats to filter', { userId });
    // Get chats where the user is a participant (individual chats only)
    const userChats = await prisma.chat.findMany({
      where: {
        isGroupChat: false,
        participants: {
          some: {
            userId: userId
          }
        }
      },
      include: {
        participants: {
          select: {
            userId: true,
          }
        }
      }
    });

    // Extract all user IDs that have individual chats with the logged-in user
    const usersWithExistingChats = userChats.flatMap((chat) =>
      chat.participants
        .filter((participant: { userId: string }) => participant.userId !== userId)
        .map((participant: { userId: string }) => participant.userId)
    );

    // Filter out users who already have individual chats with the logged-in user
    const filteredUsers = users.filter(user => !usersWithExistingChats.includes(user.id));

    logger.info('Users fetched successfully', {
      totalUsers: users.length,
      filteredUsers: filteredUsers.length,
      existingChats: usersWithExistingChats.length
    });

    res.status(200).json({
      message: "Users Fetched Successfully",
      users: filteredUsers
    });
  } catch (error)
  {
    logger.error('Error fetching users list', error, { userId, action: 'getAllUsers' });
    res.status(500).json({
      message: "Something went wrong while fetching the data"
    });
  }
};

export const getUsers = async (req: Request, res: Response) =>
{
  const { id } = req.params;
  const userId: string = Array.isArray(id) ? id[0] : (id as string);

  logger.api('GET', '/getUsers', { userId });

  if (!userId)
  {
    logger.warn('getUsers: missing userId', { params: req.params });
    return res.status(400).json({
      message: "User ID is required"
    });
  }

  try
  {
    logger.database('Fetching users for group chat', { excludeUserId: userId });
    const users = await prisma.user.findMany({
      where: {
        id: { not: userId },
      },
      select: {
        id: true,
        name: true,
        imageUrl: true,
        email: true,
      },
    });

    logger.info('Users fetched successfully', { count: users.length, userId });
    res.status(200).json({
      message: "Users fetched successfully",
      users
    });
  } catch (error)
  {
    logger.error('Error getting users', error, { userId, action: 'getUsers' });
    res.status(500).json({
      message: "Internal Server Error"
    });
  }
};

export const health = async (req: Request, res: Response) =>
{
  res.send("this is the health check router");
};
