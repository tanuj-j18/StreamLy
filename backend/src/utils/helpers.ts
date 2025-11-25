
import * as mediasoup from 'mediasoup';
import { config } from './config';
import { types as mediasoupTypes } from 'mediasoup'
import logger from './logger';

export const createMediasoupWorker = async() => {
    //create a mediasoup worker 
    logger.mediasoup("Creating Mediasoup worker", { rtcMinPort: 10000, rtcMaxPort: 20000 });
    
    try {
      const newWorker = await mediasoup.createWorker({
          rtcMinPort : 10000, 
          rtcMaxPort : 20000
      });

      logger.mediasoup("Mediasoup worker created", { workerPid: newWorker.pid });

      newWorker.on("died" , (error)=> {
          logger.error("Mediasoup worker has died", error, {
              workerPid: newWorker.pid,
              action: 'worker_died',
              critical: true
          });

          setTimeout(() => {
              logger.error("Exiting process due to worker death", new Error('Worker died'), {
                  workerPid: newWorker.pid,
                  critical: true
              });
              process.exit(1);
          } , 2000);
      });
    
      return newWorker; 
    } catch (error) {
      logger.error("Error creating Mediasoup worker", error, {
          action: 'create_mediasoup_worker',
          critical: true
      });
      throw error;
    }

}

export const createWebRTCTransport = async(mediasoupRouter : mediasoupTypes.Router) => {
    const {
        maxIncomingBitrate , 
        initialAvailableOutgoingBitrate,
        listenIps
    } = config.mediaSoup.webRTCTransport


    const transport = await mediasoupRouter.createWebRtcTransport({
        listenIps: [...listenIps],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
        initialAvailableOutgoingBitrate,
      });

      if(maxIncomingBitrate){
       try {
         await transport.setMaxIncomingBitrate(maxIncomingBitrate);
       } catch (error) { console.error("Error while setting max bitrate");
       }
      };

      return {
        transport , 
        params : 
        {
          id : transport.id , 
          iceParameters : transport.iceParameters ,
          iceCandidates : transport.iceCandidates ,
          dtlsParameters : transport.dtlsParameters
        }
      }
}
