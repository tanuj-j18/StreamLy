
import { types as mediasoupTypes } from "mediasoup";
import logger from "../utils/logger"; 

export default class Peer {
    id: string;
    name: string;
    private transport: Map<string, mediasoupTypes.Transport>;
    private producers: Map<string, mediasoupTypes.Producer>;
    private consumers: Map<string, mediasoupTypes.Consumer>;

    constructor(id: string, name: string) {
        this.id = id;
        this.name = name;
        this.transport = new Map();
        this.producers = new Map();
        this.consumers = new Map();
    }

    //add a transport
    addTransport(transport: mediasoupTypes.Transport) {
        this.transport.set(transport.id, transport);
    }

    //connect the transport 
    async connectTransport(transportId: string, dtlsParameters: mediasoupTypes.DtlsParameters) {
        logger.mediasoup("Connecting transport", { transportId, userId: this.id, name: this.name });
        
        const transport = this.transport.get(transportId);
        if (!transport) {
            const error = new Error(`Transport not found: ${transportId}`);
            logger.error("Cannot find transport", error, {
                transportId,
                userId: this.id,
                availableTransports: Array.from(this.transport.keys()),
                action: 'connect_transport'
            });
            throw error;
        }
        
        try {
          await transport.connect({ dtlsParameters });
          logger.mediasoup("Transport connected successfully", { transportId, userId: this.id });
        } catch (error) {
          logger.error("Error connecting transport", error, {
            transportId,
            userId: this.id,
            action: 'connect_transport'
          });
          throw error;
        }
    };

    async createProducer(producerTransportId: string, rtpParameters: mediasoupTypes.RtpParameters, kind: mediasoupTypes.MediaKind, appData?: any) {
        logger.mediasoup("Creating producer", { producerTransportId, kind, userId: this.id, name: this.name });
        
        const transport = this.transport.get(producerTransportId);
        if (!transport) {
            const error = new Error(`Transport not found: ${producerTransportId}`);
            logger.error("Cannot find transport for producer", error, {
                producerTransportId,
                userId: this.id,
                availableTransports: Array.from(this.transport.keys()),
                action: 'create_producer'
            });
            throw error;
        }

        try {
          const producer = await transport.produce({ rtpParameters, kind, appData });
          if (!producer) {
              const error = new Error("Producer creation returned null");
              logger.error("Producer is null", error, {
                  producerTransportId,
                  kind,
                  userId: this.id,
                  action: 'create_producer'
              });
              throw error;
          }
          
          this.producers.set(producer.id, producer);
          logger.mediasoup("Producer created successfully", { 
              producerId: producer.id,
              kind,
              userId: this.id
          });

          producer.on("transportclose", () => {
              logger.mediasoup("Producer closed (transport close)", {
                  producerId: producer.id,
                  userId: this.id
              });
              producer.close();
              this.producers.delete(producer.id);
          });

          return producer;
        } catch (error) {
          logger.error("Error creating producer", error, {
              producerTransportId,
              kind,
              userId: this.id,
              action: 'create_producer'
          });
          throw error;
        }
    }

    async createConsumer(
        consumer_transport_id: string,
        producer_id: string,
        rtpCapabilities: mediasoupTypes.RtpCapabilities
    ) {
        logger.mediasoup("Creating consumer", { 
            consumer_transport_id, 
            producer_id, 
            userId: this.id,
            name: this.name
        });
        
        let consumerTransport = this.transport.get(consumer_transport_id);
        if (!consumerTransport) {
            const error = new Error(`Consumer transport not found: ${consumer_transport_id}`);
            logger.error("Consumer transport not found", error, {
                consumer_transport_id,
                producer_id,
                userId: this.id,
                availableTransports: Array.from(this.transport.keys()),
                action: 'create_consumer'
            });
            throw error;
        }

        let consumer:mediasoupTypes.Consumer;

        try {
            logger.debug("Consuming from transport", { consumer_transport_id, producer_id });
            consumer = await consumerTransport.consume({
                producerId: producer_id,
                rtpCapabilities,
                paused: false,
            });
            logger.mediasoup("Consumer successfully created", {
                consumerId: consumer.id,
                producerId: producer_id,
                kind: consumer.kind,
                userId: this.id
            });
        } catch (error) {
            logger.error("Consume failed", error, {
                consumer_transport_id,
                producer_id,
                userId: this.id,
                action: 'create_consumer'
            });
            throw error;
        }

        if (consumer.type === "simulcast") {
            try {
                await consumer.setPreferredLayers({
                    spatialLayer: 2,
                    temporalLayer: 2,
                });
                logger.debug("Set preferred layers for simulcast", { consumerId: consumer.id });
            } catch (error) {
                logger.warn("Failed to set preferred layers", { error: error instanceof Error ? error.message : String(error) });
            }
        }

        this.consumers.set(consumer.id, consumer);

        consumer.on("transportclose", () => {
            logger.mediasoup("Consumer transport closed", {
                name: this.name,
                consumer_id: consumer.id,
                userId: this.id
            });
            this.consumers.delete(consumer.id);
        });

        return {
            consumer,
            user: {
                id: this.id,
                name: this.name,
            },
            params: {
                producerId: producer_id,
                id: consumer.id,
                kind: consumer.kind,
                rtpParameters: consumer.rtpParameters,
                type: consumer.type,
                producerPaused: consumer.producerPaused,
            },
        };
    }

    closeProducer(producer_id : string){
        logger.mediasoup("Closing producer", { producer_id, userId: this.id, name: this.name });

        try{
            const producer = this.producers.get(producer_id);
            if (producer) {
                producer.close();
                logger.mediasoup("Producer closed", { producer_id, userId: this.id });
            } else {
                logger.warn("Producer not found to close", { producer_id, userId: this.id });
            }
        }catch(e){
            logger.error("Error closing producer", e, {
                producer_id,
                userId: this.id,
                action: 'close_producer'
            });
        }

        this.producers.delete(producer_id);
    }

    close(){
        this.transport.forEach((transport)=>transport.close());
    }

    removeConsumer(consumerId : string){
        this.consumers.delete(consumerId);
    }

    get_producers(){
        return this.producers ; 
    }

    get_transports(){
        return this.transport; 
    }

}
