import { Request, Response } from "express";
import prisma from "../utils/prisma";
import logger from "../utils/logger";

export const createChat = async (req: Request, res: Response) =>
{
  const { senderId, receiverId, name } = req.body;

  logger.api('POST', '/singlechat', { senderId, receiverId });

  if (!senderId || !receiverId)
  {
    logger.warn('createChat: missing required fields', { senderId: !!senderId, receiverId: !!receiverId });
    return res.status(400).json({
      message: "Did not receive both senderId and receiverId",
    });
  }

  try
  {
    logger.database('Checking for existing chat', { senderId, receiverId });
    // Step 1: Check if a chat already exists between the two users
    const existingChat = await prisma.chat.findFirst({
      where: {
        isGroupChat: false,
        participants: {
          some: {
            userId: senderId,
          },
        },
      },
      include: {
        participants: {
          select: {
            userId: true,
          },
        },
      },
    });

    if (existingChat)
    {
      const isChatWithReceiver = existingChat.participants.some(
        (participant) => participant.userId === receiverId
      );

      if (isChatWithReceiver)
      {
        logger.info('Chat already exists', { chatId: existingChat.id, senderId, receiverId });
        return res.status(200).json({
          message: "Chat already exists",
          chatId: existingChat.id,
        });
      }
    }

    logger.database('Creating new chat', { senderId, receiverId });
    // Step 2: Create a new chat if not found
    const newChat = await prisma.chat.create({
      data: {
        name: name || null,
        isGroupChat: false,
        latestMessage: "",
        participants: {
          create: [
            {
              userId: senderId,
              lastSeenAt: new Date(),
            },
            {
              userId: receiverId,
              lastSeenAt: new Date(),
            },
          ],
        },
      },
    });

    logger.info('Chat created successfully', { chatId: newChat.id, senderId, receiverId });
    res.status(201).json({
      message: "Chat created successfully",
      chatId: newChat.id,
    });
  } catch (error)
  {
    logger.error('Error creating chat', error, { senderId, receiverId, action: 'createChat' });
    res.status(500).json({
      message: "Something went wrong while creating the chat"
    });
  }
};

export const createGroupChat = async (req: Request, res: Response) =>
{
  const { userIds, name, adminId } = req.body;

  logger.api('POST', '/groupchat', {
    userIdsCount: Array.isArray(userIds) ? userIds.length : 0,
    name,
    adminId
  });

  if (!Array.isArray(userIds) || userIds.length === 0)
  {
    logger.warn('createGroupChat: invalid userIds', { userIds: Array.isArray(userIds) ? userIds.length : 'not array' });
    return res.status(400).json({
      message: "Invalid user id format or user id is empty"
    });
  }

  if (!name)
  {
    logger.warn('createGroupChat: missing name');
    return res.status(400).json({
      message: "Group chat name is required"
    });
  }

  try
  {
    logger.database('Creating group chat', { name, participantCount: userIds.length, adminId: adminId || userIds[0] });
    // Step 1: Create a new group chat
    const newChat = await prisma.chat.create({
      data: {
        name,
        isGroupChat: true,
        adminId: adminId || userIds[0],
        latestMessage: "",
        participants: {
          create: userIds.map((userId: string) => ({
            userId,
            lastSeenAt: new Date(),
          })),
        },
      },
    });

    logger.info('Group chat created successfully', { chatId: newChat.id, name, participantCount: userIds.length });
    res.status(201).json({
      message: "Group chat created successfully",
      chatId: newChat.id,
    });
  } catch (error)
  {
    logger.error('Error creating group chat', error, { name, userIds, action: 'createGroupChat' });
    res.status(500).json({
      message: "Something went wrong while creating a group chat"
    });
  }
};

export const getChats = async (req: Request, res: Response) =>
{
  const { id } = req.params;
  const userId = Array.isArray(id) ? id[0] : id;

  logger.api('GET', '/getchats', { userId });

  if (!userId)
  {
    logger.warn('getChats: missing userId', { params: req.params });
    return res.status(400).json({
      message: "User ID is required"
    });
  }

  try
  {
    logger.database('Fetching chats for user', { userId });
    const chats = await prisma.chat.findMany({
      where: {
        participants: {
          some: {
            userId: userId,
          },
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                name: true,
                id: true,
                imageUrl: true
              }
            },
          },
        },
        admin: {
          select: {
            id: true,
            name: true,
          },
        },
        messages: {
          select: {
            authorId: true,
            author: {
              select: {
                name: true,
                email: true,
                imageUrl: true
              },
            },
            chat: {
              select: {
                id: true
              }
            },
            content: true,
            mediaUrl: true,
            callUrl: true,
            isCallEnded: true,
            id: true,
            type: true,
            createdAt: true
          }
        }
      },
      orderBy: {
        latestMessageCreatedAt: 'desc',
      }
    });

    logger.debug('Processing chats', { chatCount: chats.length, userId });
    const simplifiedChats = chats.map((chat) =>
    {
      // Get current user's participant data for unseen count
      const currentUserParticipant = chat.participants.find(
        (participant) => participant.userId === userId
      );

      //for single 1v1 chat find the other participant's name
      let otherParticipant;
      if (chat.isGroupChat === false)
      {
        otherParticipant = chat.participants.find((p) => p.user.id !== userId)
      }
      return {
        id: chat.id,
        name: chat.name ?? otherParticipant?.user.name,
        isGroupChat: chat.isGroupChat,
        latestMessage: chat.latestMessage,
        latestMessageCreatedAt: chat.latestMessageCreatedAt,
        unseenCount: currentUserParticipant?.unseenCount || 0,
        chatMessages: chat.messages,
        admin: chat.admin ? {
          id: chat.admin.id,
          name: chat.admin.name,
        } : null,
        otherImageUrl: otherParticipant?.user.imageUrl,
        participants: chat.participants.map((participant) => ({
          userId: participant.user.id,
          name: participant.user.name,
          imageUrl: participant.user.imageUrl,
          lastSeenAt: participant.lastSeenAt,
        })),
      };
    });

    logger.info('Chats fetched successfully', {
      userId,
      chatCount: simplifiedChats.length
    });

    res.status(200).json({
      message: "Chats fetched successfully",
      chats: simplifiedChats,
    });
  } catch (error)
  {
    logger.error('Error fetching chats', error, { userId, action: 'getChats' });
    res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

// Additional utility function to update unseen count when user opens a chat
export const markChatAsSeen = async (req: Request, res: Response) =>
{
  const { chatId, userId } = req.body;

  logger.api('POST', '/resetseen', { chatId, userId });

  if (!chatId || !userId)
  {
    logger.warn('markChatAsSeen: missing required fields', { chatId: !!chatId, userId: !!userId });
    return res.status(400).json({
      message: "Chat ID and User ID are required",
    });
  }

  try
  {
    logger.database('Marking chat as seen', { chatId, userId });
    await prisma.participant.updateMany({
      where: {
        chatId,
        userId,
      },
      data: {
        unseenCount: 0,
        lastSeenAt: new Date(),
      },
    });

    logger.info('Chat marked as seen', { chatId, userId });
    res.status(200).json({
      message: "Chat marked as seen",
    });
  } catch (error)
  {
    logger.error('Error marking chat as seen', error, { chatId, userId, action: 'markChatAsSeen' });
    res.status(500).json({
      message: "Something went wrong while updating chat status",
    });
  }
};
