
import { Request, Response } from "express";
import prisma from "../utils/prisma";
import logger from "../utils/logger";

export const getMessagesByChatId = async (req: Request, res: Response) =>
{
  const { id, incomingUserId } = req.params;
  const chatId = Array.isArray(id) ? id[0] : id;
  const userId = Array.isArray(incomingUserId) ? incomingUserId[0] : incomingUserId;

  logger.api('GET', '/getmessages', { chatId, userId });

  if (!chatId || !userId)
  {
    logger.warn('getMessagesByChatId: missing required params', {
      hasChatId: !!chatId,
      hasUserId: !!userId
    });
    return res.status(400).json({
      message: "Chat ID and User ID are required"
    });
  }

  try
  {
    logger.database('Checking if chat exists', { chatId });
    // Check if chat exists
    const chatExists = await prisma.chat.findUnique({
      where: {
        id: chatId
      }
    });

    if (!chatExists)
    {
      logger.warn('Chat not found', { chatId });
      return res.status(404).json({
        message: "Chat with this id does not exist"
      });
    }

    logger.database('Fetching messages for chat', { chatId });
    // Fetch messages for the chat
    const messages = await prisma.messages.findMany({
      where: {
        chatId: chatId,
      },
      orderBy: {
        createdAt: "asc",
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            imageUrl: true,
          },
        },
      },
    });

    logger.database('Fetching chat details with participants', { chatId });
    // Fetch chat details with participants
    const chat = await prisma.chat.findFirst({
      where: {
        id: chatId,
      },
      select: {
        id: true,
        name: true,
        isGroupChat: true,
        adminId: true,
        latestMessage: true,
        latestMessageCreatedAt: true,
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                imageUrl: true,
                email: true,
              }
            }
          }
        },
        admin: {
          select: {
            id: true,
            name: true,
          }
        }
      }
    });

    if (!chat)
    {
      logger.error('Chat details not found after existence check', new Error('Chat details missing'), {
        chatId,
        action: 'getMessagesByChatId'
      });
      return res.status(404).json({
        message: "Chat details not found"
      });
    }

    logger.debug('Processing chat details', {
      chatId,
      isGroupChat: chat.isGroupChat,
      participantCount: chat.participants.length
    });

    // For individual chats (non-group chats), use the other participant's name as chat name
    if (chat.isGroupChat === false || chat.name === null)
    {
      const filteredParticipants = chat.participants.filter(
        (participant) => participant.userId !== userId
      );

      const chatName = filteredParticipants[0]?.user.name || "Unknown User";
      const chatImageUrl = filteredParticipants[0]?.user.imageUrl || null;

      const newChat = {
        ...chat,
        name: chatName,
        imageUrl: chatImageUrl, // Add image for individual chats
        participants: chat.participants.map(participant => ({
          userId: participant.user.id,
          name: participant.user.name,
          imageUrl: participant.user.imageUrl,
          email: participant.user.email,
          lastSeenAt: participant.lastSeenAt,
          unseenCount: participant.unseenCount
        }))
      };

      logger.info('Messages fetched successfully (individual chat)', {
        chatId,
        messageCount: messages.length,
        userId
      });

      return res.status(200).json({
        message: "Successfully fetched the chat messages",
        data: messages,
        chatDetails: newChat
      });
    }

    // For group chats, return as is with proper participant mapping
    const groupChat = {
      ...chat,
      participants: chat.participants.map(participant => ({
        userId: participant.user.id,
        name: participant.user.name,
        imageUrl: participant.user.imageUrl,
        email: participant.user.email,
        lastSeenAt: participant.lastSeenAt,
        unseenCount: participant.unseenCount
      }))
    };

    logger.info('Messages fetched successfully (group chat)', {
      chatId,
      messageCount: messages.length,
      userId
    });

    res.status(200).json({
      message: "Successfully fetched the chat messages",
      data: messages,
      chatDetails: groupChat
    });

  } catch (error)
  {
    logger.error('Error fetching messages', error, {
      chatId,
      userId,
      action: 'getMessagesByChatId'
    });
    res.status(500).json({
      message: "Something went wrong while fetching the messages"
    });
  }
};
