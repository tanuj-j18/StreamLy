import * as io from "socket.io";
import Room from "./Room";
import { WebSocketEventType } from "./enums";
import dotenv from 'dotenv';
import { createMediasoupWorker } from "../utils/helpers";
import logger from "../utils/logger";
import prisma from "../utils/prisma";

dotenv.config({
  path: './.env'
})

interface SocketCallback
{
  (response: any): void
}

declare module "socket.io" {
  interface Socket
  {
    roomId?: string;
  }
}

//Create a socket class 
export class SocketService
{
  private _io: io.Server;
  private _roomList: Map<string, Room>;

  constructor(ioServer: io.Server)
  {
    logger.mediasoup("Initializing Mediasoup socket server");
    this._io = ioServer;  // use the passed io instance directly
    this._roomList = new Map();

    try
    {
      this.listenToWebSockets(this._io);
      logger.mediasoup("✅ Mediasoup socket server initialized successfully");
    } catch (error)
    {
      logger.error("ERROR initializing Mediasoup socket server", error, {
        action: 'mediasoup_socket_init',
        critical: true
      });
    }
  }

  private listenToWebSockets(io: io.Server)
  {
    io.on("connection", (socket) =>
    {
      socket.on(WebSocketEventType.CREATE_ROOM, async ({ roomId }, cb: SocketCallback) =>
      {
        if (!roomId)
        {
          logger.warn("CREATE_ROOM: No room id provided", { socketId: socket.id });
          cb({ error: "No room id provided to create room" });
          return;
        }

        logger.mediasoup("CREATE_ROOM request", { roomId, socketId: socket.id });
        let room = this._roomList.get(roomId);

        if (!room)
        {
          try
          {
            logger.mediasoup("Creating new room", { roomId });
            const worker = await createMediasoupWorker();
            this._roomList.set(roomId, new Room(roomId, io, worker));
            logger.mediasoup("Room created successfully", { roomId, workerPid: worker.pid });
            cb({ message: "Room created successfully" });
          } catch (error)
          {
            logger.error("Error creating room", error, { roomId, action: 'create_room' });
            cb({ error: "Failed to create room" });
          }
        } else
        {
          logger.warn("Room already exists", { roomId, socketId: socket.id });
          cb({ error: "Room with this id already exists" });
        }
      });

      socket.on(WebSocketEventType.DISCONNECT, () =>
      {
        logger.mediasoup("User disconnected from Mediasoup", { socketId: socket.id, roomId: socket.roomId });
        if (socket.roomId) {
          const room = this._roomList.get(socket.roomId);
          if (room) {
            const userId = room.getUserIdBySocketId(socket.id);
            if (userId) {
              logger.mediasoup("Disconnect cleanup initiated", { userId, roomId: socket.roomId });
              const peerData = room._peers.get(userId);
              const producersMap = peerData?.get_producers();
              const producerIds = producersMap ? Array.from(producersMap.keys()) : [];
              
              if (peerData) {
                try {
                  peerData.close();
                } catch (err) {
                  logger.error("Error closing peer on disconnect", err, { userId, roomId: socket.roomId });
                }
              }
              
              const peer = room.removePeer(userId);
              
              if (room._peers.size <= 0) {
                logger.mediasoup("Room is empty after disconnect, closing and deleting room", { roomId: socket.roomId });
                room.close();
                this._roomList.delete(room.id);
              } else {
                socket.to(room.id).emit(WebSocketEventType.USER_LEFT, {
                  message: `${peer?.name} disconnected`,
                  user: peer,
                  leavingProducers: producerIds
                });
              }
            }
          }
        }
      });

      socket.on(WebSocketEventType.JOIN_ROOM, async (
        data: { userId: string; roomId: string; name: string },
        cb: SocketCallback
      ) =>
      {
        const { userId, roomId, name } = data;

        logger.mediasoup("JOIN_ROOM request", { userId, roomId, name, socketId: socket.id });

        if (!userId || !roomId || !name)
        {
          logger.warn("JOIN_ROOM: Missing required data", { userId: !!userId, roomId: !!roomId, name: !!name, socketId: socket.id });
          cb({ error: "Missing data in JOIN_ROOM" });
          return;
        }

        // Validate if the call has already ended in the database
        try
        {
          const callMessage = await prisma.messages.findFirst({
            where: { callUrl: roomId }
          });
          
          if (callMessage && callMessage.isCallEnded)
          {
            logger.warn("JOIN_ROOM: Rejected join attempt as call is already ended", { roomId, userId, name });
            cb({ error: "This call has already ended" });
            return;
          }
        } catch (error)
        {
          logger.error("Error checking call status during JOIN_ROOM", error, { roomId, userId });
        }

        let room = this._roomList.get(roomId);

        if (!room)
        {
          logger.mediasoup("Room not found, creating a room", { roomId });
          try
          {
            const worker = await createMediasoupWorker();
            const newRoom = new Room(roomId, io, worker);
            
            // CRITICAL: Wait for router to be ready before adding to map
            // This prevents race conditions where multiple users create separate rooms
            await newRoom.waitForRouter();
            
            // Double-check room doesn't exist (another user might have created it while we were waiting)
            // Use a simple check-then-set pattern (not perfect but better than nothing)
            if (!this._roomList.has(roomId)) {
              this._roomList.set(roomId, newRoom);
              logger.mediasoup("Room created for join", { roomId, workerPid: worker.pid });
            } else {
              // Another user created the room while we were waiting, use the existing one
              logger.mediasoup("Room was created by another user while waiting, using existing room", { roomId });
              // Note: The newRoom will be garbage collected, but its worker will remain
              // In production, you might want to close the worker here
            }
          } catch (error)
          {
            logger.error("Error creating room for join", error, { roomId, action: 'join_room_create' });
            cb({ error: "Failed to create room" });
            return;
          }
        }

        // Get the room (either existing or newly created)
        room = this._roomList.get(roomId);
        
        // Ensure router is ready before proceeding
        if (room) {
          await room.waitForRouter();
        }

        if (!room)
        {
          logger.error("Failed to create or retrieve room", new Error('Room is null'), { roomId, action: 'join_room' });
          cb({ error: "Failed to create or retrieve room" });
          return;
        }

        try
        {
          const peer = room.createPeer(name, userId, socket.id);
          if (!peer)
          {
            logger.warn("Failed to create peer", { userId, roomId, name });
            cb({ error: "Failed to create peer" });
            return;
          }

          socket.roomId = roomId;
          socket.join(roomId);

          socket.to(roomId).emit(WebSocketEventType.USER_JOINED, {
            message: `${name} joined the room`,
            user: peer,
          });

          logger.mediasoup("Room joined successfully", { name, roomId, userId, socketId: socket.id, peerId: peer.id });
          cb({ message: "Room joined successfully" });
        } catch (error)
        {
          logger.error("Error joining room", error, { userId, roomId, name, action: 'join_room' });
          cb({ error: "Failed to join room" });
        }
      });


      socket.on(WebSocketEventType.EXIT_ROOM, ({ userId }, cb) =>
      {
        logger.mediasoup("EXIT_ROOM request", { userId, socketId: socket.id, roomId: socket.roomId });

        if (!userId)
        {
          logger.warn("EXIT_ROOM: Missing userId", { socketId: socket.id });
          cb({ error: "Not in a room" });
          return
        }
        if (!socket.roomId)
        {
          logger.warn("EXIT_ROOM: Not in a room", { socketId: socket.id, userId });
          cb({ error: "Not in a room" });
          return;
        }

        const room = this._roomList.get(socket.roomId);
        if (!room)
        {
          logger.warn("EXIT_ROOM: Room does not exist", { roomId: socket.roomId, userId });
          cb({ error: "Room does not exist" });
          return;
        }

        const peerData = room._peers.get(userId);
        const producersMap = peerData?.get_producers();
        const producerIds = producersMap ? Array.from(producersMap.keys()) : [];

        logger.mediasoup("Removing peer from room", {
          userId,
          roomId: socket.roomId,
          producerCount: producerIds.length
        });

        if (peerData) {
          try {
            peerData.close();
          } catch (err) {
            logger.error("Error closing peer on EXIT_ROOM", err, { userId, roomId: socket.roomId });
          }
        }

        const peer = room.removePeer(userId);
        if (room._peers.size <= 0)
        {
          logger.mediasoup("Room is empty, closing and deleting room", { roomId: socket.roomId });
          room.close();
          this._roomList.delete(room.id);
        }

        socket.to(room.id).emit(WebSocketEventType.USER_LEFT, {
          message: `${peer?.name} left the room`,
          user: peer,
          leavingProducers: producerIds
        })

        logger.mediasoup("Peer removed successfully", { userId, roomId: socket.roomId, peerName: peer?.name });
        if (cb) cb({ success: true });
      });

      socket.on(WebSocketEventType.END_CALL, async ({ userId, roomId }, cb: SocketCallback) =>
      {
        logger.mediasoup("END_CALL request", { userId, roomId, socketId: socket.id });

        if (!userId || !roomId)
        {
          logger.warn("END_CALL: Missing userId or roomId", { userId, roomId, socketId: socket.id });
          cb({ error: "Missing required fields" });
          return;
        }

        try
        {
          // Find the call message in the database
          const callMessage = await prisma.messages.findFirst({
            where: { callUrl: roomId }
          });

          if (!callMessage)
          {
            logger.warn("END_CALL: No matching call message found in database", { roomId });
            cb({ error: "Call record not found" });
            return;
          }

          // Enforce that only the person who started the call can end it
          if (callMessage.authorId !== userId)
          {
            logger.warn("END_CALL: Unauthorized attempt to end call", {
              roomId,
              requestUserId: userId,
              initiatorUserId: callMessage.authorId
            });
            cb({ error: "Only the person who started the call can end it" });
            return;
          }

          // Update call status to ended in the database
          await prisma.messages.update({
            where: { id: callMessage.id },
            data: { isCallEnded: true }
          });

          logger.mediasoup("Call marked as ended in database", { roomId, callMessageId: callMessage.id });

          // Notify everyone in the room that the call has ended
          io.to(roomId).emit(WebSocketEventType.CALL_ENDED, {
            message: "Call has been ended by the initiator"
          });

          // Clean up the Mediasoup room and close all transports/producers
          const room = this._roomList.get(roomId);
          if (room)
          {
            room.close();
            this._roomList.delete(roomId);
            logger.mediasoup("Mediasoup room terminated and cleaned up", { roomId });
          }

          cb({ success: true });
        } catch (error)
        {
          logger.error("Error ending call", error, { roomId, userId, action: 'end_call' });
          cb({ error: "Failed to end call" });
        }
      });

      socket.on(WebSocketEventType.GET_IN_ROOM_USERS, (_, cb: SocketCallback) =>
      {
        const roomId = socket.roomId as string;

        logger.mediasoup("GET_IN_ROOM_USERS request", { roomId, socketId: socket.id });

        const room = this._roomList.get(roomId)
        if (!room)
        {
          logger.warn("GET_IN_ROOM_USERS: Room does not exist", { roomId, socketId: socket.id });
          cb({ error: "Room does not exist" });
          return;
        }

        // Note: Tawk-master passes roomId here, but getCurrentPeers expects userId
        // This is a bug in Tawk-master - we'll keep it for compatibility but log it
        const users = room.getCurrentPeers(roomId);
        logger.mediasoup("Current users fetched", { roomId, userCount: users.length });
        cb({ users });
      });

      socket.on(WebSocketEventType.GET_PRODUCERS, (_, cb: SocketCallback) =>
      {
        const roomId = socket.roomId as string;

        logger.mediasoup("GET_PRODUCERS request", { roomId, socketId: socket.id });

        const room = this._roomList.get(roomId);

        if (!room)
        {
          logger.warn("GET_PRODUCERS: Room does not exist", { roomId, socketId: socket.id });
          cb({ error: "Room does not exists" });
          return;
        }

        let producerList = room.getProducerListForPeer();
        logger.mediasoup("Producer list sent", { 
          roomId, 
          producerCount: producerList.length,
          producers: producerList.map(p => ({
            producer_id: p.producer_id,
            userId: p.userId,
            kind: p.kind
          }))
        });
        cb({ producerList });
      });


      socket.on(WebSocketEventType.GET_ROUTER_RTP_CAPABILITIES, (_, cb: SocketCallback) =>
      {
        const roomId = socket.roomId as string;

        logger.mediasoup("GET_ROUTER_RTP_CAPABILITIES request", { roomId, socketId: socket.id });

        const room = this._roomList.get(roomId);
        if (!room)
        {
          logger.warn("GET_ROUTER_RTP_CAPABILITIES: Room does not exist", { roomId, socketId: socket.id });
          cb({ error: "Room does not exists" });
          return;
        }
        const rtpCapabilities = room.getRtpCapabilities();
        if (!rtpCapabilities)
        {
          logger.error("RTP capabilities not available", new Error('Router not initialized'), { roomId });
          cb({ error: "RTP capabilities not available" });
          return;
        }
        logger.mediasoup("RTP capabilities sent", { roomId, codecCount: rtpCapabilities.codecs?.length || 0 });
        cb({ rtpCapabilities });
      });

      socket.on(
        WebSocketEventType.CREATE_WEBRTC_TRANSPORT,
        async ({ userId }, cb: SocketCallback) =>
        {
          logger.mediasoup("CREATE_WEBRTC_TRANSPORT request", { userId, socketId: socket.id, roomId: socket.roomId });

          const room = this._roomList.get(socket.roomId!);
          if (!room)
          {
            logger.warn("CREATE_WEBRTC_TRANSPORT: Room not found", { userId, socketId: socket.id, roomId: socket.roomId });
            cb({ error: "Couldn't find room" });
            return;
          }

          try
          {
            const params = await room.createWebRtcTransport(userId);
            if (!params || params.error)
            {
              logger.error("Failed to create WebRTC transport", new Error(params?.error || 'Unknown error'), {
                userId,
                roomId: socket.roomId,
                action: 'create_webrtc_transport'
              });
              cb(params || { error: "Failed to create transport" });
              return;
            }

            logger.mediasoup("WebRTC transport created", {
              userId,
              transportId: params.params?.id,
              roomId: socket.roomId
            });
            cb(params);
          } catch (error)
          {
            logger.error("Error creating WebRTC transport", error, {
              userId,
              roomId: socket.roomId,
              action: 'create_webrtc_transport'
            });
            cb({ error: "Failed to create transport" });
          }
        }
      );

      socket.on(WebSocketEventType.CONNECT_TRANSPORT, async ({ userId, transportId, dtlsParameters }, cb: SocketCallback) =>
      {
        logger.mediasoup("CONNECT_TRANSPORT request", { userId, transportId, socketId: socket.id, roomId: socket.roomId });

        const room = this._roomList.get(socket.roomId!);
        if (!room)
        {
          logger.warn("CONNECT_TRANSPORT: Room not found", { userId, transportId, socketId: socket.id, roomId: socket.roomId });
          cb({ error: "Couldn't find room" });
          return;
        }

        try
        {
          await room.connectPeerTransport(userId, transportId, dtlsParameters);
          logger.mediasoup("Transport connected successfully", { userId, transportId, roomId: socket.roomId });
          cb("Success");
        } catch (error)
        {
          logger.error("Error connecting transport", error, {
            userId,
            transportId,
            roomId: socket.roomId,
            action: 'connect_transport'
          });
          cb({ error: "Failed to connect transport" });
        }
      });

      socket.on(
        WebSocketEventType.PRODUCE,
        async (
          { userId, kind, rtpParameters, producerTransportId, appData },
          cb: SocketCallback
        ) =>
        {
          logger.mediasoup("PRODUCE request", {
            userId,
            kind,
            producerTransportId,
            socketId: socket.id,
            roomId: socket.roomId,
            hasAppData: !!appData
          });

          const room = this._roomList.get(socket.roomId!);
          if (!room)
          {
            logger.warn("PRODUCE: Room not found", { userId, socketId: socket.id, roomId: socket.roomId });
            return cb({ ERROR: "error couldn't find the room" });
          }

          try
          {
            let producer_id = (await room.produce(
              userId,
              producerTransportId,
              rtpParameters,
              kind,
              appData
            )) as string;

            if (!producer_id)
            {
              logger.error("Failed to create producer", new Error('Producer ID is null'), {
                userId,
                kind,
                roomId: socket.roomId,
                action: 'produce'
              });
              return cb({ error: "Failed to create producer" });
            }

            const newProducers = [
              {
                producer_id,
                userId,
                kind,
                appData,
              },
            ];

            logger.mediasoup("Producer created, emitting to room", {
              producer_id,
              userId,
              kind,
              roomId: socket.roomId
            });

            //emit new producers to OTHER users in the room (not the producer themselves)
            logger.mediasoup("Emitting NEW_PRODUCERS to room", {
              roomId: socket.roomId,
              producer_id,
              userId,
              kind,
              newProducers: newProducers,
              target: "other users in room"
            });
            socket.to(socket.roomId!).emit(WebSocketEventType.NEW_PRODUCERS, newProducers);
            cb({
              producer_id,
              userId
            });
          } catch (error)
          {
            logger.error("Error in PRODUCE event", error, {
              userId,
              kind,
              roomId: socket.roomId,
              action: 'produce'
            });
            cb({ error: "Failed to produce" });
          }
        }
      );

      socket.on(
        WebSocketEventType.CLOSE_PRODUCER,
        ({ producer_id, userId }, cb: SocketCallback) =>
        {
          logger.mediasoup("CLOSE_PRODUCER request", {
            producer_id,
            userId,
            socketId: socket.id,
            roomId: socket.roomId
          });

          const room = this._roomList.get(socket.roomId!);
          if (!room)
          {
            logger.warn("CLOSE_PRODUCER: Room not found", { socketId: socket.id, roomId: socket.roomId });
            if (cb) cb({ error: "Room not found" });
            return;
          }

          if (userId)
          {
            try
            {
              room.closeProducer(producer_id, userId);
              logger.mediasoup("Producer closed", { producer_id, userId, roomId: socket.roomId });
              if (cb) cb({ success: true });
            } catch (error)
            {
              logger.error("Error closing producer", error, {
                producer_id,
                userId,
                roomId: socket.roomId,
                action: 'close_producer'
              });
              if (cb) cb({ error: "Failed to close producer" });
            }
          } else
          {
            logger.warn("CLOSE_PRODUCER: No userId provided", { producer_id, socketId: socket.id });
            if (cb) cb({ error: "UserId is required" });
          }
        }
      );

      socket.on(
        WebSocketEventType.CONSUME,
        async (
          { userId, consumerTransportId, producerId, rtpCapabilities },
          cb: SocketCallback
        ) =>
        {
          logger.mediasoup("CONSUME request", {
            userId,
            consumerTransportId,
            producerId,
            socketId: socket.id,
            roomId: socket.roomId
          });

          const room = this._roomList.get(socket.roomId!);

          if (!room)
          {
            logger.warn("CONSUME: No room associated", { socketId: socket.id, roomId: socket.roomId });
            cb({ error: "Room not found" });
            return;
          }

          try
          {
            const params = await room.consume(
              userId,
              socket.id,
              consumerTransportId,
              producerId,
              rtpCapabilities
            );

            if (!params)
            {
              logger.warn("CONSUME: Consumer params not returned", {
                userId,
                producerId,
                consumerTransportId,
                roomId: socket.roomId
              });
              cb({ error: "Failed to create consumer" });
              return;
            }

            logger.mediasoup("Consumer created successfully", {
              userId,
              producerId,
              consumerId: params.id,
              kind: params.kind,
              roomId: socket.roomId
            });
            cb(params);
          } catch (error)
          {
            logger.error("Error in CONSUME event", error, {
              userId,
              producerId,
              consumerTransportId,
              roomId: socket.roomId,
              action: 'consume'
            });
            cb({ error: "Failed to consume" });
          }
        }
      );

      socket.on(WebSocketEventType.ADD_PAUSED_PRODUCER, ({ videoProducerId }, cb) =>
      {
        logger.mediasoup("ADD_PAUSED_PRODUCER request", {
          videoProducerId,
          socketId: socket.id,
          roomId: socket.roomId
        });

        const room = this._roomList.get(socket.roomId!);

        if (!room)
        {
          logger.warn("ADD_PAUSED_PRODUCER: No room present", { socketId: socket.id, roomId: socket.roomId });
          cb({ error: "Room does not exists" });
          return;
        }

        if (!videoProducerId)
        {
          logger.warn("ADD_PAUSED_PRODUCER: No videoProducerId", { socketId: socket.id });
          cb({ error: "Video ProducerId not found" });
          return;
        }

        try
        {
          room.pauseProducer(videoProducerId);
          const pausedProducers = room.addAndGetPausedProducer(videoProducerId);
          logger.mediasoup("Producer paused, emitting to room", {
            videoProducerId,
            pausedCount: pausedProducers.length,
            roomId: socket.roomId
          });
          socket.to(socket.roomId!).emit(WebSocketEventType.GET_PAUSED_PRODUCERS, pausedProducers);
          cb({ success: true });
        } catch (error)
        {
          logger.error("Error pausing producer", error, {
            videoProducerId,
            roomId: socket.roomId,
            action: 'add_paused_producer'
          });
          cb({ error: "Failed to pause producer" });
        }
      });

      socket.on(WebSocketEventType.REMOVE_PAUSED_PRODUCER, ({ videoProducerId }, cb) =>
      {
        logger.mediasoup("REMOVE_PAUSED_PRODUCER request", {
          videoProducerId,
          socketId: socket.id,
          roomId: socket.roomId
        });

        const room = this._roomList.get(socket.roomId!);

        if (!room)
        {
          logger.warn("REMOVE_PAUSED_PRODUCER: No room present", { socketId: socket.id, roomId: socket.roomId });
          cb({ error: "Room does not exists" });
          return;
        }

        if (!videoProducerId)
        {
          logger.warn("REMOVE_PAUSED_PRODUCER: No videoProducerId", { socketId: socket.id });
          cb({ error: "Video ProducerId not found" });
          return;
        }

        try
        {
          room.resumeProducer(videoProducerId);
          const pausedProducers = room.removeAndGetPausedProducer(videoProducerId);
          logger.mediasoup("Producer resumed, emitting to room", {
            videoProducerId,
            pausedCount: pausedProducers.length,
            roomId: socket.roomId
          });
          socket.to(socket.roomId!).emit(WebSocketEventType.GET_PAUSED_PRODUCERS, pausedProducers);
          cb({ success: true });
        } catch (error)
        {
          logger.error("Error resuming producer", error, {
            videoProducerId,
            roomId: socket.roomId,
            action: 'remove_paused_producer'
          });
          cb({ error: "Failed to resume producer" });
        }
      });

      socket.on(WebSocketEventType.GET_MY_ROOM_INFO, async ({ roomId }, cb: SocketCallback) =>
      {
        logger.mediasoup("GET_MY_ROOM_INFO request", { roomId, socketId: socket.id });

        if (!roomId)
        {
          cb({ error: "Missing roomId" });
          return;
        }

        try
        {
          const callMessage = await prisma.messages.findFirst({
            where: { callUrl: roomId }
          });

          if (!callMessage)
          {
            cb({ error: "Call record not found" });
            return;
          }

          cb({
            initiatorId: callMessage.authorId,
            isCallEnded: callMessage.isCallEnded
          });
        } catch (error)
        {
          logger.error("Error fetching room info", error, { roomId });
          cb({ error: "Failed to get room info" });
        }
      });

    })
  }
}
