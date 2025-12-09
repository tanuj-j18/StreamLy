import Peer from "./Peer";
import * as io from "socket.io";
import { types as mediasoupTypes } from "mediasoup";
import { config } from "../utils/config";
import { WebSocketEventType } from "./enums";
import logger from "../utils/logger";


export default class Room
{
  id: string;
  _peers: Map<string, Peer>;
  private _userIdToSocketId: Map<string, string>; // Track userId -> socketId mapping
  io: io.Server
  private _router: mediasoupTypes.Router | null = null;
  private _pausedVideoProducerIds: string[] = [];

  private _routerReady: Promise<void>;

  constructor(id: string, io: io.Server, worker: mediasoupTypes.Worker)
  {
    this.id = id;
    this._peers = new Map<string, Peer>;
    this._userIdToSocketId = new Map<string, string>();
    this.io = io;
    const mediaCodecs = config.mediaSoup.router.mediaCodecs;
    
    // Create router and wait for it to be ready
    this._routerReady = worker.createRouter({ mediaCodecs }).then((router) =>
    {
      this._router = router;
      logger.mediasoup("Router created for room", { roomId: id });
    }).catch((error) => {
      logger.error("Failed to create router for room", error, { roomId: id, action: 'create_router' });
      throw error;
    });
  }

  // Wait for router to be ready before allowing operations
  public async waitForRouter(): Promise<void> {
    await this._routerReady;
  }

  public createPeer(name: string, userId: string, socketId?: string)
  {
    if (this._peers.has(userId))
    {
      return this._peers.get(userId);
    }
    this._peers.set(userId, new Peer(userId, name));
    if (socketId)
    {
      this._userIdToSocketId.set(userId, socketId);
    }
    return this._peers.get(userId);
  }

  public removePeer(userId: string)
  {
    const peer = this._peers.get(userId);
    if (!peer)
    {
      return;
    }
    this._peers.delete(userId);
    this._userIdToSocketId.delete(userId);
    return peer;
  }

  public getCurrentPeers(excludeUserId: string)
  {
    const peers: { id: string, name: string }[] = [];
    Array.from(this._peers.keys())
      .filter((key) => key !== excludeUserId)
      .forEach((peerId) =>
      {
        if (this._peers.has(peerId))
        {
          const { id, name } = this._peers.get(peerId)!;
          peers.push({ id, name });
        }
      })

    return peers;
  }

  public async createWebRtcTransport(userId: string)
  {
    const { maxIncomingBitrate, initialAvailableOutgoingBitrate } =
      config.mediaSoup.webRTCTransport

    const transport = await this._router?.createWebRtcTransport({
      listenIps: config.mediaSoup.webRTCTransport.listenIps,
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      initialAvailableOutgoingBitrate,
    })!;

    if (maxIncomingBitrate)
    {
      try
      {
        await transport.setMaxIncomingBitrate(maxIncomingBitrate);
      } catch (error) { }
    }

    transport.on("dtlsstatechange", (dtlsState) =>
    {
      if (dtlsState === "closed")
      {
        logger.mediasoup("Transport close", {
          name: this._peers.get(userId)?.name,
        });
        transport.close();
      }
    });

    transport.on("@close", () =>
    {
      logger.mediasoup("Transport close", { name: this._peers.get(userId)?.name });
    });
    logger.mediasoup("Adding transport", { transportId: transport.id, userId });
    const peer = this._peers.get(userId);
    if (!peer)
    {
      console.error("Peer not found for userId:", userId);
      console.error("Available peers:", Array.from(this._peers.keys()));
      console.error("Available peer names:", Array.from(this._peers.values()).map(p => ({ id: p.id, name: p.name })));
      return { error: "Peer not found for userId: " + userId };
    }
    peer.addTransport(transport);

    return {
      params: {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      },
    };
  }

  public async connectPeerTransport(
    userId: string,
    transportId: string,
    dtlsParameters: mediasoupTypes.DtlsParameters
  )
  {
    const peer = this._peers.get(userId);
    if (!peer)
    {
      logger.warn("No peer found with this id");
    }

    await peer?.connectTransport(transportId, dtlsParameters);
  }

  public getRtpCapabilities()
  {
    if (!this._router) {
      logger.warn("Router not ready when getting RTP capabilities", { roomId: this.id });
      return null;
    }
    return this._router.rtpCapabilities;
  }

  //to get the active producers in the room 
  getProducerListForPeer()
  {
    let producerList: { userId: string; producer_id: string; kind: mediasoupTypes.MediaKind; appData?: any }[] = [];
    const peersInfo: Array<{ userId: string; producerCount: number; producerIds: string[] }> = [];
    
    this._peers.forEach((peer) =>
    {
      const peerProducers = Array.from(peer.get_producers().keys());
      peersInfo.push({
        userId: peer.id,
        producerCount: peerProducers.length,
        producerIds: peerProducers
      });
      
      peer.get_producers().forEach((producer) =>
      {
        producerList.push({
          userId: peer.id,
          producer_id: producer.id,
          kind: producer.kind,
          appData: producer.appData,
        });
      });
    });
    
    logger.mediasoup("getProducerListForPeer called", {
      roomId: this.id,
      totalPeers: this._peers.size,
      totalProducers: producerList.length,
      peersInfo: peersInfo,
      producerList: producerList
    });
    
    return producerList;
  }

  public async produce(
    userId: string,
    producerTransportId: string,
    rtpParameters: mediasoupTypes.RtpParameters,
    kind: mediasoupTypes.MediaKind,
    appData?: any
  ): Promise<string>
  {
    try
    {
      const peer = this._peers.get(userId);
      if (!peer)
      {
        throw new Error(`Peer with id ${userId} not found`);
      }
      logger.mediasoup("the params are", { producerTransportId });
      const producer = await peer.createProducer(producerTransportId, rtpParameters, kind, appData);

      if (!producer)
      {
        throw new Error("Producer is undefined");
      }

      // Note: NEW_PRODUCERS is already emitted in SocketServer.ts
      // This broadcast is kept for consistency but may be redundant
      // this.broadCast(userId, WebSocketEventType.NEW_PRODUCERS, [
      //   {
      //     producer_id: producer.id,
      //     userId: userId,
      //   },
      // ]);

      return producer.id;
    } catch (err)
    {
      console.error("Error in produce:", err);
      throw err;
    }
  }

  async consume(
    userId: string,
    socket_id: string,
    consumer_transport_id: string,
    producer_id: string,
    rtpCapabilities: mediasoupTypes.RtpCapabilities
  )
  {
    const routerCanConsume = this._router?.canConsume({
      producerId: producer_id,
      rtpCapabilities,
    });
    if (!routerCanConsume)
    {
      console.warn("Router cannot consume the given producer");
      return;
    }

    const peer = this._peers.get(userId);

    if (!peer)
    {
      console.warn("No Peer found with the given Id");
      return;
    }

    const consumer_created = await peer.createConsumer(
      consumer_transport_id,
      producer_id,
      rtpCapabilities
    );

    if (!consumer_created)
    {
      logger.warn("Couldn't create consumer");
      return;
    }

    const { consumer, params } = consumer_created;

    consumer.on("producerclose", () =>
    {
      logger.mediasoup("Consumer closed due to close event in producer id", {
        name: peer.name,
        consumer_id: consumer.id,
      });

      peer.removeConsumer(consumer.id);

      this.io.to(socket_id).emit(WebSocketEventType.CONSUMER_CLOSED, {
        consumer_id: consumer.id,
      });
    });

    return params;
  }



  broadCast(excludeUserId: string, name: string, data: any)
  {
    // Broadcast to all peers except the sender
    // Get sender's socketId to exclude them
    const senderSocketId = this._userIdToSocketId.get(excludeUserId);

    // Send to all other users in the room
    for (let otherUserId of Array.from(this._peers.keys()).filter(
      (id) => id !== excludeUserId
    ))
    {
      const socketId = this._userIdToSocketId.get(otherUserId);
      if (socketId)
      {
        this.io.to(socketId).emit(name, data);
      }
    }
  }
  send(userId: string, name: string, data: any)
  {
    // Get socketId for the userId, or emit to room if not found
    const socketId = this._userIdToSocketId.get(userId);
    if (socketId)
    {
      this.io.to(socketId).emit(name, data);
    } else
    {
      // Fallback: emit to entire room
      this.io.to(this.id).emit(name, data);
    }
  }

  closeProducer(producer_id: string, userId: string)
  {
    const peer = this._peers.get(userId);
    if (!peer)
    {
      logger.warn("No peer found with the userId:", { userId });
      return;
    }
    peer.closeProducer(producer_id);
    this.broadCast(userId, WebSocketEventType.PRODUCER_CLOSED, {
      producer_id,
      userId: peer.id,
    });
    return;
  }

  public pauseProducer(producerId: string): void {
    for (const peer of this._peers.values()) {
      const producer = peer.get_producers().get(producerId);
      if (producer) {
        producer.pause();
        logger.mediasoup("Mediasoup Producer paused", { producerId, userId: peer.id });
        break;
      }
    }
  }

  public resumeProducer(producerId: string): void {
    for (const peer of this._peers.values()) {
      const producer = peer.get_producers().get(producerId);
      if (producer) {
        producer.resume();
        logger.mediasoup("Mediasoup Producer resumed", { producerId, userId: peer.id });
        break;
      }
    }
  }

  public getUserIdBySocketId(socketId: string): string | undefined {
    for (const [userId, sId] of this._userIdToSocketId.entries()) {
      if (sId === socketId) {
        return userId;
      }
    }
    return undefined;
  }

  addAndGetPausedProducer(producerId: string): string[]
  {
    if (!producerId)
    {
      throw new Error("No producerId found in pause producer");
    }

    if (!this._pausedVideoProducerIds.includes(producerId))
    {
      this._pausedVideoProducerIds.push(producerId);
    }

    return this._pausedVideoProducerIds;
  }

  removeAndGetPausedProducer(producerId: string): string[]
  {
    if (!producerId)
    {
      throw new Error("No producerId found in pause producer");
    }

    if (!this._pausedVideoProducerIds.includes(producerId))
    {
      console.warn("paused producer with this id not found");
      throw new Error("paused producer does not exists");
    }

    this._pausedVideoProducerIds = this._pausedVideoProducerIds.filter(id => id !== producerId);
    return this._pausedVideoProducerIds;
  }

  public close()
  {
    logger.mediasoup("Closing room and cleaning up all peers/transports", { roomId: this.id });
    this._peers.forEach((peer) => {
      peer.close();
    });
    this._peers.clear();
    this._userIdToSocketId.clear();
    if (this._router) {
      this._router.close();
      this._router = null;
    }
  }

}
