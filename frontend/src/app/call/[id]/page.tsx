'use client'

import { io } from "socket.io-client";
import { Device } from 'mediasoup-client';
import { useParams, useSearchParams } from "next/navigation"
import { useMemo, useEffect, useState, useRef } from "react";
import { Toaster, toast } from "sonner"
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { Phone, Mic, MicOff, Video, VideoOff, Monitor, Pin, PinOff } from 'lucide-react';
import { WebSocketEventType } from "@/lib/types";

import { types as mediasoupTypes } from "mediasoup-client";



//types and interfaces 
interface webRtcTransportParams {
  id: string;
  iceParameters: mediasoupTypes.IceParameters;
  iceCandidates: mediasoupTypes.IceCandidate[];
  dtlsParameters: mediasoupTypes.DtlsParameters;
}

interface ProducerContainer {
  producer_id: string;
  userId: string;
  kind?: "video" | "audio";
  appData?: any;
}

interface Peer {
  id: string;
  name: string;
}

type ConsumerEntry = {
  consumer: mediasoupTypes.Consumer;
  userId: string;
}

interface RemoteStream {
  consumer: mediasoupTypes.Consumer;
  stream: MediaStream;
  kind: mediasoupTypes.MediaKind;
  producerId: string;
  userId: string;
  appData?: any;
}

// Separate component for remote video to use hooks properly
const RemoteVideo = ({ 
  stream, 
  producerId, 
  userName, 
  userInitial, 
  isPaused 
}: { 
  stream: MediaStream; 
  producerId: string; 
  userName: string; 
  userInitial: string;
  isPaused: boolean;
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const playAttemptRef = useRef<number>(0);
  const isPlayingRef = useRef<boolean>(false);
  const playTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    if (!stream) {
      console.warn("⚠️ RemoteVideo: No stream provided", { producerId });
      return;
    }
    
    const videoElement = videoRef.current;
    if (!videoElement) {
      console.warn("⚠️ RemoteVideo: videoRef.current is null", { producerId });
      return;
    }
    
    if (isPaused) {
      console.log("⏸️ RemoteVideo: Video is paused", { producerId });
      if (videoElement) {
        videoElement.pause();
        isPlayingRef.current = false;
      }
      return;
    }
    
    const tracks = stream.getTracks();
    tracks.forEach(track => {
      if (!track.enabled) {
        console.log("🔓 Enabling disabled remote track:", track.id, track.kind);
        track.enabled = true;
      }
    });

    console.log("🎥 RemoteVideo useEffect: Attaching stream to video", { 
      producerId, 
      streamId: stream.id,
      trackCount: tracks.length,
      tracks: tracks.map(t => ({ 
        id: t.id, 
        kind: t.kind, 
        enabled: t.enabled, 
        readyState: t.readyState,
        muted: t.muted
      })),
      currentSrcObject: videoElement.srcObject ? 'exists' : 'null',
      isSameStream: videoElement.srcObject === stream
    });
    
    // Only update if stream has changed
    if (videoElement.srcObject !== stream) {
      // Set new stream
      videoElement.srcObject = stream;
      streamRef.current = stream;
      isPlayingRef.current = false;
      playAttemptRef.current = 0;
      console.log("✅ Stream attached to video element", { producerId, streamId: stream.id });
    }
    
    // Attempt to play the video (only if not already playing)
    const attemptPlay = async () => {
      if (!videoElement || videoElement.srcObject !== stream || isPaused) {
        return;
      }
      
      // Prevent multiple simultaneous play attempts
      if (isPlayingRef.current && !videoElement.paused) {
        console.log("ℹ️ Video already playing, skipping play attempt", { producerId });
        return;
      }
      
      playAttemptRef.current++;
      const attemptNumber = playAttemptRef.current;
      
      try {
        // Use a small delay to ensure stream is ready
        await new Promise(resolve => setTimeout(resolve, 100));
        
        if (videoElement.srcObject !== stream || isPaused) {
          console.log("ℹ️ Stream changed or paused during play attempt, aborting", { producerId, attemptNumber });
          return;
        }
        
        await videoElement.play();
        isPlayingRef.current = true;
        console.log("✅ Video play() succeeded", { producerId, streamId: stream.id, attemptNumber });
      } catch (err: any) {
        // AbortError is usually harmless - it means play() was interrupted by another play() call
        if (err.name === 'AbortError') {
          console.log("ℹ️ Video play() interrupted (AbortError) - attempt", attemptNumber, { producerId });
          // Don't retry on AbortError - it usually means another play() call succeeded
          return;
        } else {
          console.error("❌ Video play() failed:", err, { producerId, attemptNumber });
          // Retry only a few times
          if (attemptNumber < 3) {
            if (playTimeoutRef.current) {
              clearTimeout(playTimeoutRef.current);
            }
            playTimeoutRef.current = setTimeout(() => {
              if (videoElement && videoElement.srcObject === stream && !isPaused) {
                attemptPlay();
              }
            }, 500 * attemptNumber);
          }
        }
      }
    };
    
    const handleUnmute = () => {
      console.log("🔊 RemoteVideo: Track unmuted, playing video", { producerId });
      attemptPlay();
    };

    tracks.forEach(track => {
      track.addEventListener("unmute", handleUnmute);
    });

    // Start play attempt
    attemptPlay();
    
    return () => {
      // Cleanup timeout on unmount
      if (playTimeoutRef.current) {
        clearTimeout(playTimeoutRef.current);
        playTimeoutRef.current = null;
      }
      tracks.forEach(track => {
        track.removeEventListener("unmute", handleUnmute);
      });
    };
  }, [stream, producerId, isPaused]);
  
  if (isPaused) {
    return (
      <div className="w-full h-full aspect-video flex flex-col items-center justify-center bg-black text-white">
        <div className="w-24 h-24 flex items-center justify-center rounded-full bg-gray-700 mb-2 text-4xl font-semibold">
          {userInitial}
        </div>
      </div>
    );
  }
  
  return (
    <video
      ref={videoRef}
      key={`video-${producerId}-${stream.id}`}
      autoPlay
      playsInline
      muted={false}
      className="w-full h-full object-contain aspect-video"
      onLoadedMetadata={() => {
        console.log("📹 Video metadata loaded", { producerId, streamId: stream.id });
      }}
      onCanPlay={() => {
        console.log("▶️ Video can play", { producerId, streamId: stream.id });
      }}
      onError={(e) => {
        console.error("❌ Video element error:", e, { producerId, streamId: stream.id });
      }}
    />
  );
};

class VolumeAnalyzer {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private animationFrameId: number | null = null;
  private onVolumeChange: (volume: number) => void;

  constructor(stream: MediaStream, onVolumeChange: (volume: number) => void) {
    this.onVolumeChange = onVolumeChange;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.source = this.audioContext.createMediaStreamSource(stream);
      this.source.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const checkVolume = () => {
        if (!this.analyser) return;
        this.analyser.getByteFrequencyData(dataArray);
        let values = 0;
        for (let i = 0; i < bufferLength; i++) {
          values += dataArray[i];
        }
        const average = values / bufferLength;
        this.onVolumeChange(average);
        this.animationFrameId = requestAnimationFrame(checkVolume);
      };

      checkVolume();
    } catch (e) {
      console.warn("Failed to initialize AudioContext", e);
    }
  }

  close() {
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    if (this.source) this.source.disconnect();
    if (this.audioContext) this.audioContext.close();
  }
}

export default function Page() {

  //params
  const roomId = useParams();

  //refs 
  const localStreamRef = useRef<HTMLVideoElement | null>(null);
  const audioProducerRef = useRef<mediasoupTypes.Producer | null>(null);
  const videoProducerRef = useRef<mediasoupTypes.Producer | null>(null);
  const deviceRef = useRef<Device | null>(null);
  const consumerTransportRef = useRef<mediasoupTypes.Transport | null>(null);
  const producerTransportRef = useRef<mediasoupTypes.Transport | null>(null);
  const consumers = useRef<Map<string, ConsumerEntry>>(new Map());
  const consumedProducers = useRef<Set<string>>(new Set());
  
  const screenProducerRef = useRef<any>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const rawCameraStreamRef = useRef<MediaStream | null>(null);
  const volumeAnalyzersRef = useRef<Map<string, VolumeAnalyzer>>(new Map());
  const userIdRef = useRef<string | undefined>(undefined);

  //states 
  const [userId, setUserId] = useState<string>();
  const [username, setUserName] = useState<string>();
  const [producers, setProducers] = useState<ProducerContainer[]>([]);
  const [isMicOn, setIsMicOn] = useState<boolean>(true);
  const [isVideoOn, setIsVideoOn] = useState<boolean>(true);
  const [usersInRoom, setUsersInRoom] = useState<Peer[]>([]);
  const [remoteStream, setRemoteStreams] = useState<RemoteStream[]>([]);
  const [pausedVideoProducerIds, setPausedVideoProducerIds] = useState<string[]>([]);
  const [initiatorId, setInitiatorId] = useState<string | null>(null);
  const [showExitOptions, setShowExitOptions] = useState<boolean>(false);
  const [isScreenSharing, setIsScreenSharing] = useState<boolean>(false);
  const [pinnedStreamId, setPinnedStreamId] = useState<string | null>(null);
  const [activeSpeakers, setActiveSpeakers] = useState<Record<string, boolean>>({});

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  // Audio-only mode detection
  const searchParams = useSearchParams();
  const isAudioOnly = searchParams.get('mode') === 'audio';

  // 3. AudioContext-based volume analysis for Active Speaker detection
  useEffect(() => {
    if (!userId) return;

    const currentAnalyzers = volumeAnalyzersRef.current;
    const activeStreamUserIds = new Set<string>();

    // Analyze local mic if active
    if (isMicOn && localStreamRef.current?.srcObject) {
      const localStream = localStreamRef.current.srcObject as MediaStream;
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        activeStreamUserIds.add("local");
        if (!currentAnalyzers.has("local")) {
          const analyzer = new VolumeAnalyzer(new MediaStream([audioTrack]), (volume) => {
            const isSpeaking = volume > 15;
            setActiveSpeakers(prev => {
              if (prev[userId] === isSpeaking) return prev;
              return { ...prev, [userId]: isSpeaking };
            });
          });
          currentAnalyzers.set("local", analyzer);
        }
      }
    }

    // Analyze remote users audio tracks
    const audioStreams = remoteStream.filter(s => s.kind === "audio");
    audioStreams.forEach(streamInfo => {
      const rUserId = streamInfo.userId;
      const rStream = streamInfo.stream;
      if (rUserId && rStream) {
        const audioTrack = rStream.getAudioTracks()[0];
        if (audioTrack) {
          activeStreamUserIds.add(rUserId);
          if (!currentAnalyzers.has(rUserId)) {
            const analyzer = new VolumeAnalyzer(new MediaStream([audioTrack]), (volume) => {
              const isSpeaking = volume > 15;
              setActiveSpeakers(prev => {
                if (prev[rUserId] === isSpeaking) return prev;
                return { ...prev, [rUserId]: isSpeaking };
              });
            });
            currentAnalyzers.set(rUserId, analyzer);
          }
        }
      }
    });

    // Clean up inactive analyzers
    currentAnalyzers.forEach((analyzer, key) => {
      if (!activeStreamUserIds.has(key)) {
        analyzer.close();
        currentAnalyzers.delete(key);
        const targetUserId = key === "local" ? userId : key;
        setActiveSpeakers(prev => {
          if (!prev[targetUserId]) return prev;
          const copy = { ...prev };
          delete copy[targetUserId];
          return copy;
        });
      }
    });
  }, [remoteStream, isMicOn, userId]);

  // Clean up all analyzers on unmount
  useEffect(() => {
    return () => {
      volumeAnalyzersRef.current.forEach(analyzer => analyzer.close());
      volumeAnalyzersRef.current.clear();
    };
  }, []);

  // 4. Screen Sharing capabilities
  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      await stopScreenShare();
    } else {
      try {
        console.log("🖥️ Starting screen share...");
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];

        if (!producerTransportRef.current) {
          toast.error("Producer transport is not ready");
          screenTrack.stop();
          return;
        }

        const screenProducer = await producerTransportRef.current.produce({
          track: screenTrack,
          appData: { isScreenShare: true }
        });

        screenProducerRef.current = screenProducer;
        screenStreamRef.current = screenStream;
        setIsScreenSharing(true);
        setPinnedStreamId("local-screen");
        toast.success("Sharing your screen!");

        screenTrack.onended = () => {
          stopScreenShare();
        };
      } catch (error) {
        console.error("Screen share error:", error);
        toast.error("Failed to start screen share");
      }
    }
  };

  const stopScreenShare = async () => {
    try {
      console.log("🖥️ Stopping screen share...");
      if (screenProducerRef.current) {
        const producerId = screenProducerRef.current.id;
        screenProducerRef.current.close();
        screenProducerRef.current = null;
        
        try {
          await sendRequest(WebSocketEventType.CLOSE_PRODUCER, { producer_id: producerId, userId: userIdRef.current });
          console.log("✅ Notified server about closed screen producer:", producerId);
        } catch (err) {
          console.error("❌ Failed to notify server about closed screen producer:", err);
        }
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop());
        screenStreamRef.current = null;
      }
      setIsScreenSharing(false);
      setPinnedStreamId(prev => prev === "local-screen" ? null : prev);
      toast.info("Stopped screen share");
    } catch (error) {
      console.error("Error stopping screen share:", error);
    }
  };


  const socket = useMemo(
    () =>
      io(`${process.env.NEXT_PUBLIC_BACKEND_URL}`, {
        withCredentials: true,
      }),
    []
  );

  //Auth guard variables
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  // FIX 1: Removed incorrect `if (isAuthenticated)` wrapper — the inner check
  // `isAuthenticated === false` was always false inside a truthy isAuthenticated guard.
  useEffect(() => {
    console.log("Auth state changed:", { isAuthenticated, isLoading });

    if (!isLoading) {
      if (isAuthenticated === false) {
        toast.error("You are not logged in");
        router.push("/login");
      }
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    const storedUserId = localStorage.getItem("userId");
    const storedName = localStorage.getItem("name");
    if (!storedUserId || !storedName) {
      console.log("No stored user");
      return;
    }

    setUserId(storedUserId);
    setUserName(storedName);

  }, [])

  useEffect(() => {
    if (isAuthenticated === false || isLoading || !username) {
      console.log("taking some time , ", isAuthenticated, isLoading);
      return;
    }
    //user joins a room
    const init = async () => {
      try {
        // Fetch room info first to see if it's ended or to get initiator ID
        try {
          const roomInfo = await sendRequest(WebSocketEventType.GET_MY_ROOM_INFO, { roomId: roomId.id });
          if (roomInfo) {
            setInitiatorId(roomInfo.initiatorId);
            if (roomInfo.isCallEnded) {
              toast.error("This call has already ended.");
              setTimeout(() => {
                router.push("/");
              }, 2000);
              return;
            }
          }
        } catch (e) {
          console.warn("Failed to get room info:", e);
        }

        await loadEverything();
        await startStreaming();
      } catch (error: any) {
        console.error("Error joining call:", error);
        toast.error(error.message || "Failed to join the call room.");
        setTimeout(() => {
          router.push("/");
        }, 3000);
      }
    };

    init();

    socket.onAny((event, args) => {
      routeIncommingEvents({ event, args });
    });

    const handleBeforeUnload = async (event: any) => {
      const response = await sendRequest(WebSocketEventType.EXIT_ROOM, { userId: userIdRef.current });
      console.log("this is the response", response);
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [roomId, isAuthenticated, username, userId]);



  // FIX 2: Added `remoteStream` to the dependency array so `existingStreamProducerIds`
  // is never stale when filtering producers to consume.
  useEffect(() => {
    if (producers && producers.length > 0 && userId) {
      console.log("🔄 useEffect: Processing producers to consume");
      console.log("  - totalProducers:", producers.length);
      console.log("  - currentUserId:", userId);
      console.log("  - producers details:");
      producers.forEach((p, idx) => {
        console.log(`  Producer ${idx}:`, {
          producer_id: p.producer_id,
          userId: p.userId,
          kind: p.kind,
          isOwn: p.userId === userId,
          alreadyConsumed: consumedProducers.current.has(p.producer_id),
          willBeConsumed: p.userId !== userId && !consumedProducers.current.has(p.producer_id)
        });
      });
      
      // Group by userId to see distribution
      const producersByUser = producers.reduce((acc, p) => {
        if (!acc[p.userId]) acc[p.userId] = [];
        acc[p.userId].push({ producer_id: p.producer_id, kind: p.kind });
        return acc;
      }, {} as Record<string, Array<{ producer_id: string; kind: string | undefined }>>);
      console.log("  - producers by userId:", producersByUser);
      
      // Filter out own producers, already consumed ones, and ones that already have streams
      const existingStreamProducerIds = new Set(remoteStream.map(s => s.producerId));
      const producersToConsume = producers.filter((producer) => {
        if (producer.userId === userId) {
          console.log("⏭️ Skipping own producer:", { 
            producer_id: producer.producer_id, 
            userId: producer.userId,
            kind: producer.kind 
          });
          return false;
        }
        
        if (consumedProducers.current.has(producer.producer_id)) {
          console.log("⏭️ Producer already consumed (skipping):", { 
            producer_id: producer.producer_id,
            userId: producer.userId,
            kind: producer.kind
          });
          return false;
        }
        
        if (existingStreamProducerIds.has(producer.producer_id)) {
          console.log("⏭️ Producer already has stream (skipping):", { 
            producer_id: producer.producer_id,
            userId: producer.userId,
            kind: producer.kind
          });
          // Mark as consumed since we already have a stream for it
          consumedProducers.current.add(producer.producer_id);
          return false;
        }
        
        return true;
      });
      console.log("🎯 Producers to consume:", {
        total: producersToConsume.length,
        byKind: {
          video: producersToConsume.filter(p => p.kind === "video").length,
          audio: producersToConsume.filter(p => p.kind === "audio").length
        },
        byUser: producersToConsume.reduce((acc, p) => {
          if (!acc[p.userId]) acc[p.userId] = { video: 0, audio: 0 };
          if (p.kind === "video") acc[p.userId].video++;
          if (p.kind === "audio") acc[p.userId].audio++;
          return acc;
        }, {} as Record<string, { video: number; audio: number }>)
      });
      
      producersToConsume.forEach((producer) => {
        console.log("🟢 Consuming producer:", { 
          producer_id: producer.producer_id, 
          userId: producer.userId,
          kind: producer.kind 
        });
        consume(producer.producer_id).catch((error) => {
          console.error("❌ Failed to consume producer:", producer.producer_id, error);
        });
      });
    }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, producers, userId, remoteStream]);


  useEffect(() => {
    console.log("coming into producer cleanup useeffect");
    const handleProducerCleanup = (producerId: string) => {
      setRemoteStreams(prev =>
        prev.filter(stream => stream.producerId !== producerId)
      );
    };

    socket.on("producer-cleanup", handleProducerCleanup);

    return () => {
      socket.off("producer-cleanup", handleProducerCleanup);
    }
  }, []);

  //getting the paused producers 
  useEffect(() => {

    const getPausedProducers = (pausedProducers: string[]) => {
      if (!pausedProducers) {
        console.log("No paused producers received");
      }
      console.log("UE PP :", pausedProducers);
      setPausedVideoProducerIds(pausedProducers);
    };

    socket.on(WebSocketEventType.GET_PAUSED_PRODUCERS, getPausedProducers);

    return () => {
      socket.off(WebSocketEventType.GET_PAUSED_PRODUCERS, getPausedProducers);
    }
  }, [socket])



  //send request template
  const sendRequest = (eventType: string, data: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      socket.emit(eventType, data, (response: any) => {
        if (response.error) {
          reject(new Error(response.error))
        } else {
          resolve(response)
        }
      })
    })
  }

  //router for socket.on events from the server
  const routeIncommingEvents = ({
    event,
    args,
  }: {
    event: WebSocketEventType;
    args: any;
  }) => {
    switch (event) {
      case WebSocketEventType.USER_JOINED:
        userJoined(args);
        break;

      case WebSocketEventType.USER_LEFT:
        userLeft(args);
        break;

      case WebSocketEventType.NEW_PRODUCERS:
        newProducers(args);
        break;

      case WebSocketEventType.PRODUCER_CLOSED:
        closedProducers(args);
        break;

      case WebSocketEventType.CONSUMER_CLOSED:
        const { consumer_id } = args;
        console.log("📥 CONSUMER_CLOSED event received:", consumer_id);
        const entry = consumers.current.get(consumer_id);
        if (entry) {
          console.log("🛑 Closing consumer locally:", consumer_id);
          try {
            entry.consumer.close();
          } catch (err) {
            console.error("❌ Error closing consumer on consumerClosed:", err);
          }
          consumers.current.delete(consumer_id);
          
          const prodId = entry.consumer.producerId;
          setRemoteStreams((v) =>
            v.filter((stream) => stream.producerId !== prodId)
          );
          consumedProducers.current.delete(prodId);
        }
        break;

      case WebSocketEventType.CALL_ENDED:
        handleCallEndedByInitiator(args);
        break;

      default:
        break;
    }
  };

  const handleCallEndedByInitiator = (args: any) => {
    toast.error(args?.message || "This call has been ended by the initiator.");
    
    // Close all producers
    if (videoProducerRef.current) {
      videoProducerRef.current.close();
      videoProducerRef.current = null;
    }
    if (audioProducerRef.current) {
      audioProducerRef.current.close();
      audioProducerRef.current = null;
    }

    // Close all consumers
    consumers.current.forEach(({ consumer }) => {
      consumer.close();
    });
    consumers.current.clear();
    consumedProducers.current.clear();

    // Close transports
    if (producerTransportRef.current) {
      producerTransportRef.current.close();
      producerTransportRef.current = null;
    }
    if (consumerTransportRef.current) {
      consumerTransportRef.current.close();
      consumerTransportRef.current = null;
    }

    // Stop local media tracks
    if (localStreamRef.current && localStreamRef.current.srcObject) {
      const localStream = localStreamRef.current.srcObject as MediaStream;
      localStream.getTracks().forEach(track => track.stop());
      localStreamRef.current.srcObject = null;
    }

    setRemoteStreams([]);
    socket.disconnect();

    setTimeout(() => {
      router.push('/');
    }, 2000);
  };

  const closedProducers = (args: ProducerContainer) => {
    console.log("📥 PRODUCER_CLOSED event received:", args);
    
    // 1. Remove from producers state list
    setProducers((v) =>
      v.filter((prod) => prod.producer_id !== args.producer_id)
    );

    // 2. Remove the stream from remoteStream state so the remote video card closes instantly
    setRemoteStreams((v) =>
      v.filter((stream) => stream.producerId !== args.producer_id)
    );
    setPinnedStreamId(prev => prev === args.producer_id ? null : prev);

    // 3. Find and close any associated consumer
    const keysToDelete: string[] = [];
    consumers.current.forEach((entry, key) => {
      if (entry.consumer.producerId === args.producer_id) {
        console.log("🛑 Closing consumer:", { consumerId: key, producerId: args.producer_id });
        try {
          entry.consumer.close();
        } catch (err) {
          console.error("❌ Error closing consumer:", err);
        }
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach((key) => {
      consumers.current.delete(key);
    });

    // 4. Remove from consumedProducers set to allow re-consuming if needed
    consumedProducers.current.delete(args.producer_id);
  };


  const newProducers = (args: ProducerContainer[] | ProducerContainer) => {
    console.log("📥 NEW_PRODUCERS event received:", args);

    // Handle both single object and array cases
    const producersArray = Array.isArray(args) ? args : [args];
    console.log("📥 NEW_PRODUCERS event details:", {
      receivedCount: producersArray.length,
      producers: producersArray.map(p => ({
        producer_id: p.producer_id,
        userId: p.userId,
        kind: p.kind
      })),
      currentUserId: userId
    });

    setProducers((v) => {
      // Make sure v is always an array
      const currentProducers = Array.isArray(v) ? v : [];
      
      // Filter out duplicates by producer_id (CRITICAL: Use Map to ensure uniqueness)
      const producerMap = new Map<string, ProducerContainer>();
      
      // Add existing producers to map
      currentProducers.forEach(p => {
        producerMap.set(p.producer_id, p);
      });
      
      // Add new producers (will overwrite if duplicate, but shouldn't happen)
      let addedCount = 0;
      producersArray.forEach(p => {
        if (!producerMap.has(p.producer_id)) {
          producerMap.set(p.producer_id, p);
          addedCount++;
        } else {
          console.log("⚠️ Duplicate producer_id in NEW_PRODUCERS, skipping:", p.producer_id);
        }
      });
      
      if (addedCount === 0) {
        console.log("⏭️ All producers already exist, skipping");
        return currentProducers;
      }
      
      const allProducers = Array.from(producerMap.values());
      
      // Group by userId to see distribution
      const producersByUser = allProducers.reduce((acc, p) => {
        if (!acc[p.userId]) acc[p.userId] = [];
        acc[p.userId].push({ producer_id: p.producer_id, kind: p.kind });
        return acc;
      }, {} as Record<string, Array<{ producer_id: string; kind: string | undefined }>>);
      console.log("✅ Adding new producers to state:", {
        previousCount: currentProducers.length,
        newCount: addedCount,
        totalAfter: allProducers.length,
        producersByUser: producersByUser
      });
      
      return allProducers;
    });
  };

  const userLeft = (args: any) => {
    const leftUser = args.user as Peer;
    if (!leftUser) {
      console.warn("⚠️ USER_LEFT event received without user details", args);
      return;
    }
    //leaving producerIds 
    const producerIds = args.leavingProducers || [];
    console.log("User who left:", leftUser, producerIds);
    toast(`${leftUser.name} left the call`);

    // Remove that user from the room UI
    setUsersInRoom((v) => v.filter((peer) => peer.id !== leftUser.id));

    // Remove from producers state list
    setProducers((v) =>
      v.filter((prod) => !producerIds.includes(prod.producer_id))
    );

    // Remove from remoteStream state
    setRemoteStreams((streams) => {
      const filtered = streams.filter(
        (stream) => !producerIds.includes(stream.producerId)
      );
      return filtered;
    });
    setPinnedStreamId(prev => prev && producerIds.includes(prev) ? null : prev);

    // Close and remove associated consumers
    if (Array.isArray(producerIds)) {
      producerIds.forEach((prodId) => {
        const keysToDelete: string[] = [];
        consumers.current.forEach((entry, key) => {
          if (entry.consumer.producerId === prodId) {
            console.log("🛑 Closing consumer on user left:", { consumerId: key, producerId: prodId });
            try {
              entry.consumer.close();
            } catch (err) {
              console.error("❌ Error closing consumer on user left:", err);
            }
            keysToDelete.push(key);
          }
        });
        keysToDelete.forEach((key) => {
          consumers.current.delete(key);
        });
        consumedProducers.current.delete(prodId);
      });
    }

    console.log("✅ Cleanup done for user:", leftUser.id);
  };
  console.log("The users in room are ", usersInRoom);

  const userJoined = (args: any) => {
    const user = args.user as Peer;
    console.log("The user joined:", user);
    toast(`${user.name} has joined the call`)
    setUsersInRoom((v) => [...v, user]);
  };

  const joinRoom = async () => {
    // FIX 3: Was `\response)` — restored as a proper console.log call.
    const response = await sendRequest(WebSocketEventType.JOIN_ROOM, { userId, roomId: roomId.id, name: username });
    console.log("Joining room response", response);
    return response;
  }

  const getRtpCapabilities = async () => {
    // FIX 4: Was `\response)` — restored as a proper console.log call.
    const response = await sendRequest(WebSocketEventType.GET_ROUTER_RTP_CAPABILITIES, {});
    console.log("RTP capabilities response", response);
    //create a device
    try {
      const device = new Device();
      deviceRef.current = device;
      await device.load({ routerRtpCapabilities: response.rtpCapabilities });
      console.log("Device loaded successfully");
    } catch (error) {
      console.log("Something went wrong in device", error);
    }
    return response;
  }

  const getCurrentUsers = async () => {
    const response = await sendRequest(WebSocketEventType.GET_IN_ROOM_USERS, {});
    console.log("The current users are response: ", response);
    const { users } = response;
    setUsersInRoom(users)
    return response;
  }

  const createAndConnectConsumerTransports = async () => {
    console.log("🔵 Consumer phase 1: Starting consumer transport creation");
    try {
      if (consumerTransportRef.current) {
        console.log("⚠️ Already a consumer transport present");
        return;
      }

      if (!userId) {
        console.error("❌ No userId available for consumer transport creation");
        return;
      }
      console.log("🔵 Consumer phase 2: Requesting transport creation", { userId });
      const data = (await sendRequest(
        WebSocketEventType.CREATE_WEBRTC_TRANSPORT,
        { forceTcp: false, userId: userId }
      )) as { params?: webRtcTransportParams; error?: string };

      if (!data || data.error || !data.params) {
        console.error("❌ Failed to create consumer transport:", data?.error || "No params returned");
        // If peer not found, wait a bit and retry (race condition with room creation)
        if (data?.error?.includes("Peer not found")) {
          console.log("⏳ Peer not found, waiting 500ms and retrying...");
          await new Promise(resolve => setTimeout(resolve, 500));
          // Retry once
          const retryData = (await sendRequest(
            WebSocketEventType.CREATE_WEBRTC_TRANSPORT,
            { forceTcp: false, userId: userId }
          )) as { params?: webRtcTransportParams; error?: string };
          
          if (!retryData || retryData.error || !retryData.params) {
            console.error("❌ Retry failed:", retryData?.error || "No params returned");
            throw new Error(retryData?.error || "No Consumer Transport Created");
          }
          const finalData = retryData;
          console.log("✅ Consumer transport created on retry", { transportId: finalData.params!.id });
          
          if (!deviceRef.current) {
            console.error("❌ No device found - cannot create consumer transport");
            return;
          }
          consumerTransportRef.current = deviceRef.current?.createRecvTransport(finalData.params!);
          console.log("✅ Consumer Transport created with ID:", consumerTransportRef.current.id);
          
          consumerTransportRef.current.on("connect", async ({ dtlsParameters }, cb, eb) => {
            console.log("🔵 Consumer transport 'connect' event fired, connecting...");
            try {
              const result = await sendRequest(WebSocketEventType.CONNECT_TRANSPORT, {
                userId: userId,
                transportId: consumerTransportRef.current?.id,
                dtlsParameters,
              });
              console.log("✅ Consumer transport connected successfully", result);
              cb();
            } catch (error) {
              console.error("❌ Error connecting consumer transport:", error);
              eb(error as Error);
            }
          });
          
          consumerTransportRef.current.on("connectionstatechange", (state) => {
            console.log("🔵 Consumer transport connection state:", state);
            if (state === "connected") {
              console.log("✅ --- Consumer Transport CONNECTED ---");
            } else if (state === "failed" || state === "disconnected") {
              console.error("❌ Consumer transport disconnected/failed:", state);
              if (state === "disconnected") {
                consumerTransportRef.current?.close();
              }
            }
          });
          console.log("✅ Consumer transport setup completed - connection will happen automatically when needed");
          return;
        }
        throw new Error(data?.error || "No Consumer Transport Created");
      }
      console.log("✅ Consumer transport created", { transportId: data.params.id });

      if (!deviceRef.current) {
        console.error("❌ No device found - cannot create consumer transport");
        return;
      }
      console.log("🔵 Consumer phase 3: Creating recv transport");
      consumerTransportRef.current = deviceRef.current?.createRecvTransport(data.params);
      console.log("✅ Consumer Transport created with ID:", consumerTransportRef.current.id);
      
      consumerTransportRef.current.on("connect", async ({ dtlsParameters }, cb, eb) => {
        console.log("🔵 Consumer transport 'connect' event fired, connecting...");
        try {
          const result = await sendRequest(WebSocketEventType.CONNECT_TRANSPORT, {
            userId: userId,
            transportId: consumerTransportRef.current?.id,
            dtlsParameters,
          });
          console.log("✅ Consumer transport connected successfully", result);
          cb();
        } catch (error) {
          console.error("❌ Error connecting consumer transport:", error);
          eb(error as Error);
        }
      });
      console.log("🔵 Consumer phase 4: Setting up connection state listener");

      consumerTransportRef.current.on("connectionstatechange", (state) => {
        console.log("🔵 Consumer transport connection state:", state);
        if (state === "connected") {
          console.log("✅ --- Consumer Transport CONNECTED ---");
        } else if (state === "failed" || state === "disconnected") {
          console.error("❌ Consumer transport disconnected/failed:", state);
          if (state === "disconnected") {
            consumerTransportRef.current?.close();
          }
        }
      });
      console.log("✅ Consumer transport setup completed - connection will happen automatically when needed");
    } catch (error) {
      console.error("❌ Something went wrong while creating consumer transport", error);
    }
  }
  console.log("the producers state are", producers);

  const getProducers = async () => {
    console.log("📡 Calling GET_PRODUCERS to fetch all producers");
    const { producerList } = (await sendRequest(
      WebSocketEventType.GET_PRODUCERS,
      {}
    )) as { producerList: ProducerContainer[] };

    if (!producerList) {
      console.log("⚠️ No producers returned from GET_PRODUCERS");
      return;
    }
    console.log("📡 GET_PRODUCERS response:", {
      producerCount: producerList.length,
      producers: producerList.map(p => ({
        producer_id: p.producer_id,
        userId: p.userId,
        kind: p.kind
      })),
      producersByUser: producerList.reduce((acc, p) => {
        if (!acc[p.userId]) acc[p.userId] = [];
        acc[p.userId].push({ producer_id: p.producer_id, kind: p.kind });
        return acc;
      }, {} as Record<string, Array<{ producer_id: string; kind?: string }>>),
      videoProducers: producerList.filter(p => p.kind === "video"),
      audioProducers: producerList.filter(p => p.kind === "audio")
    });
    
    setProducers((currentProducers) => {
      const producerMap = new Map<string, ProducerContainer>();
      
      // Add existing producers to map
      currentProducers.forEach(p => {
        producerMap.set(p.producer_id, p);
      });
      
      // Add new producers from GET_PRODUCERS
      let addedCount = 0;
      producerList.forEach(p => {
        if (!producerMap.has(p.producer_id)) {
          producerMap.set(p.producer_id, p);
          addedCount++;
        } else {
          console.log("⚠️ Duplicate producer_id in GET_PRODUCERS, skipping:", p.producer_id);
        }
      });
      
      if (addedCount === 0) {
        console.log("ℹ️ GET_PRODUCERS: No new producers to add");
        return currentProducers;
      }
      
      const allProducers = Array.from(producerMap.values());
      console.log("✅ GET_PRODUCERS: Adding new producers", {
        previousCount: currentProducers.length,
        newCount: addedCount,
        totalAfter: allProducers.length
      });
      
      return allProducers;
    });

  };


  const createProducerTransport = async () => {
    if (!deviceRef.current) {
      console.error("❌ No device found - cannot create producer transport");
      return;
    }
    console.log("🟢 Producer phase 1: Requesting producer transport creation", { userId });
    const resp = (await sendRequest(
      WebSocketEventType.CREATE_WEBRTC_TRANSPORT,
      {
        forceTcp: false,
        userId: userId,
        rtpCapabilities: deviceRef.current.rtpCapabilities,
      }
    )) as { params?: webRtcTransportParams; error?: string };
    
    if (!resp || resp.error || !resp.params) {
      console.error("❌ Failed to create producer transport:", resp?.error || "No params returned");
      throw new Error(resp?.error || "No Producer Transport Created");
    }
    console.log("✅ Producer transport params received", { transportId: resp.params.id });

    producerTransportRef.current = deviceRef.current.createSendTransport(resp.params);
    console.log("✅ Producer Transport created with ID:", producerTransportRef.current.id);

    if (producerTransportRef.current) {
      try {
        producerTransportRef.current.on("connect", async ({ dtlsParameters }, cb, eb) => {
          console.log("🟢 Producer transport 'connect' event fired, connecting...");
          try {
            const result = await sendRequest(WebSocketEventType.CONNECT_TRANSPORT, {
              userId: userId,
              transportId: producerTransportRef.current!.id,
              dtlsParameters,
            });
            console.log("✅ Producer transport connected successfully", result);
            cb();
          } catch (error) {
            console.error("❌ Error connecting producer transport:", error);
            eb(error as Error);
          }
        });

        producerTransportRef.current.on(
          "produce",
          async ({ kind, rtpParameters }, cb, eb) => {
            try {
              const { producer_id } = (await sendRequest(
                WebSocketEventType.PRODUCE,
                {
                  userId: userId,
                  producerTransportId: producerTransportRef.current!.id,
                  kind,
                  rtpParameters,
                }
              )) as { producer_id: string };
              console.log("Producer created:", producer_id);

              cb({ id: producer_id });
            } catch (error) {
              console.error(error);

              eb(new Error(String(error)));
            }
          }
        );

        producerTransportRef.current.on("connectionstatechange", (state) => {
          console.log("🟢 Producer transport connection state:", state);
          switch (state) {
            case "connected":
              console.log("✅ --- Producer Transport CONNECTED ---");
              break;
            case "disconnected":
            case "failed":
              console.error("❌ Producer transport disconnected/failed:", state);
              producerTransportRef.current?.close();
              break;
          }
        });
      } catch (error) {
        console.log("Producer Creation error :: ", error);
      }
    }
  };

  const consume = async (producerId: string) => {
    console.log("🟡 Consume called for producerId:", producerId);
    // Find the producer's userId from the producers array
    const producer = producers.find(p => p.producer_id === producerId);
    if (!producer) {
      console.warn("⚠️ Producer not found in producers list:", producerId, "Available producers:", producers);
      return;
    }
    
    // Don't consume our own producers
    if (producer.userId === userId) {
      console.log("⏭️ Skipping own producer:", producerId);
      return;
    }
    
    // CRITICAL FIX: Mark as consumed IMMEDIATELY to prevent race conditions
    if (consumedProducers.current.has(producerId)) {
      console.log("⏭️ Already consumed producer (skipping):", producerId);
      return;
    }
    
    // Mark as consumed BEFORE async operation to prevent race conditions
    consumedProducers.current.add(producerId);
    console.log("🟡 Starting to consume producer:", { producerId, producerUserId: producer.userId });
    
    try {
      const data = await consumeProducers(producerId);
      console.log("🟡 Consume result:", { producerId, hasData: !!data, kind: data?.kind });
      if (!data) {
        console.error("❌ Consumer not created! Removing from consumed set:", producerId);
        consumedProducers.current.delete(producerId);
        return;
      }
      const { consumer, kind } = data;
      if (!userId) {
        console.error("❌ No userId available");
        consumedProducers.current.delete(producerId);
        return;
      }
      consumers.current.set(consumer.id, { consumer, userId: producer.userId });
      
      if (kind === "video" || kind === "audio") {
        const producerUserName = usersInRoom.find(u => u.id === producer.userId)?.name || "Unknown";
        console.log("✅ Adding remote stream:", { 
          kind, 
          producerId, 
          userId: producer.userId,
          producerUserName: producerUserName,
          streamId: data.stream?.id,
          trackCount: data.stream?.getTracks().length
        });
        setRemoteStreams((v) => {
          const existingIndex = v.findIndex(s => s.producerId === producerId);
          if (existingIndex !== -1) {
            console.warn("⚠️ Stream with same producerId already exists! Replacing:", {
              producerId,
              existingKind: v[existingIndex].kind,
              newKind: kind,
            });
            const newStreams = [...v];
            newStreams[existingIndex] = { ...data, userId: producer.userId, appData: producer.appData };
            return newStreams;
          }
          
          const newStreams = [...v, { ...data, userId: producer.userId, appData: producer.appData }];
          console.log("📊 Remote streams state updated:", {
            previousCount: v.length,
            newCount: newStreams.length,
            streams: newStreams.map(s => ({
              producerId: s.producerId,
              kind: s.kind,
              userId: s.userId
            }))
          });
          return newStreams;
        });
        
        if (producer.appData?.isScreenShare) {
          setPinnedStreamId(producerId);
        }
      }
    } catch (error) {
      console.error("❌ Error consuming producer:", producerId, error);
      consumedProducers.current.delete(producerId);
    }
  }
  console.log("The consumers are ", consumers.current);
  console.log("The remote streams are ", remoteStream);

  const consumeProducers = async (producerId: string) => {
    if (!deviceRef.current) {
      console.error("❌ No device ref in consumeProducers");
      return;
    }
    
    if (!consumerTransportRef.current) {
      console.error("❌ No consumer transport ref in consumeProducers");
      return;
    }
    
    const producerInfo = producers.find(p => p.producer_id === producerId);
    if (!producerInfo) {
      console.error("❌ Producer info not found for producerId:", producerId);
      return;
    }
    console.log("🟡 ConsumeProducers: Requesting consumer for", { producerId, producerUserId: producerInfo.userId });
    const rtpCapabilities = deviceRef.current.rtpCapabilities;
    
    try {
      const data = await sendRequest(WebSocketEventType.CONSUME, {
        userId: userId,
        rtpCapabilities,
        consumerTransportId: consumerTransportRef.current.id,
        producerId,
      });

      if (!data || data.error) {
        console.error("❌ Error from CONSUME request:", data?.error || "No data returned");
        return;
      }
      console.log("✅ Consumer params received:", { id: data.id, kind: data.kind, producerId });

      const { id, kind, rtpParameters } = data;

      const consumer = await consumerTransportRef.current.consume({
        id,
        producerId,
        kind,
        rtpParameters
      });
      console.log("✅ Consumer created:", { 
        consumerId: consumer.id, 
        kind, 
        producerId, 
        paused: consumer.paused,
        trackEnabled: consumer.track?.enabled,
        trackReadyState: consumer.track?.readyState
      });
      
      if (consumer.paused) {
        console.log("🟡 Resuming paused consumer:", { consumerId: consumer.id, kind });
        try {
          await consumer.resume();
          console.log("✅ Consumer resumed successfully:", { consumerId: consumer.id, kind, paused: consumer.paused });
        } catch (error) {
          console.error("❌ Failed to resume consumer:", error, { consumerId: consumer.id, kind });
        }
      } else {
        console.log("ℹ️ Consumer is not paused, no need to resume:", { consumerId: consumer.id, kind });
      }
      
      // Ensure track is enabled
      if (consumer.track && !consumer.track.enabled) {
        console.log("🟡 Enabling consumer track:", { consumerId: consumer.id, kind });
        consumer.track.enabled = true;
      }
      
      const stream = new MediaStream();
      stream.addTrack(consumer.track);
      console.log("✅ MediaStream created with track:", { 
        kind, 
        trackId: consumer.track.id, 
        producerId,
        trackEnabled: consumer.track.enabled,
        trackReadyState: consumer.track.readyState
      });
      
      return {
        userId: producerInfo.userId,
        consumer,
        stream,
        kind,
        producerId
      }
    } catch (error) {
      console.error("❌ Error in consumeProducers:", error);
      return;
    }
  }


  const loadEverything = async () => {
    await joinRoom();
    await getRtpCapabilities();
    await getCurrentUsers();
    await createAndConnectConsumerTransports();
    await createProducerTransport();
    
    // Get initial producers list
    await getProducers();
    
    // Also poll for producers after a short delay to catch any that were created before we joined
    setTimeout(async () => {
      console.log("🔄 Polling for producers again after delay to catch any missed producers");
      await getProducers();
    }, 2000);
  }


  const startStreaming = async () => {
    try {
      if (isAudioOnly) {
        // Voice call — audio only, no video
        const stream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: true,
        });

        const audioTrack = stream.getAudioTracks()[0];

        if (localStreamRef.current) {
          localStreamRef.current.srcObject = stream;
        }

        if (producerTransportRef.current) {
          const audioProducer = await producerTransportRef.current.produce({
            track: audioTrack,
          });
          audioProducerRef.current = audioProducer;
        }

        setIsVideoOn(false);
      } else {
        // Video call — both video and audio
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        rawCameraStreamRef.current = stream;
        const rawVideoTrack = stream.getVideoTracks()[0];
        const audioTrack = stream.getAudioTracks()[0];

        // Keep localStreamRef srcObject with direct camera and audio tracks
        if (localStreamRef.current) {
          const displayStream = new MediaStream();
          if (rawVideoTrack) displayStream.addTrack(rawVideoTrack);
          if (audioTrack) displayStream.addTrack(audioTrack);
          localStreamRef.current.srcObject = displayStream;
        }

        if (producerTransportRef.current) {
          const videoProducer = await producerTransportRef.current.produce({
            track: rawVideoTrack,
          });
          const audioProducer = await producerTransportRef.current.produce({
            track: audioTrack,
          });
          videoProducerRef.current = videoProducer;
          audioProducerRef.current = audioProducer;
        }
      }
    } catch (err) {
      console.error("Error starting stream:", err);
    }
  };

  const turnMicOn = async () => {
    if (!isMicOn) {
      // Turn ON
      console.log("Mic triggered");
      if (audioProducerRef.current) {
        audioProducerRef.current.resume();
      }
      setIsMicOn(true);
    } else {
      // Turn OFF
      if (audioProducerRef.current) {
        audioProducerRef.current.pause();
      }
      setIsMicOn(false);
    }
  };

  const turnVideoOn = async () => {
    if (!isVideoOn) {
      // TURN ON
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        rawCameraStreamRef.current = stream;
        const newVideoTrack = stream.getVideoTracks()[0];

        if (videoProducerRef.current) {
          await videoProducerRef.current.replaceTrack({ track: newVideoTrack });
          videoProducerRef.current.resume();

          const videoProducerId = videoProducerRef.current.id;
          const response = await sendRequest(WebSocketEventType.REMOVE_PAUSED_PRODUCER, { videoProducerId });
          if (response.error) {
            console.error("Error removing paused producer:", response.error);
          }
        }

        // Update local preview with a fresh MediaStream to ensure the browser re-activates the element
        if (localStreamRef.current) {
          const localStream = localStreamRef.current.srcObject as MediaStream;
          const audioTrack = localStream ? localStream.getAudioTracks()[0] : null;

          const newLocalStream = new MediaStream();
          newLocalStream.addTrack(newVideoTrack);
          if (audioTrack) {
            newLocalStream.addTrack(audioTrack);
          }
          localStreamRef.current.srcObject = newLocalStream;
          try {
            await localStreamRef.current.play();
          } catch (playErr) {
            console.warn("Local preview play error:", playErr);
          }
        }

        setIsVideoOn(true);
      } catch (error) {
        console.log("Video error:", error);
      }
    } else {
      // TURN OFF — stop the actual video track so camera light turns off
      try {
        if (videoProducerRef.current) {
          const videoProducerId = videoProducerRef.current.id;
          videoProducerRef.current.pause();

          const response = await sendRequest(WebSocketEventType.ADD_PAUSED_PRODUCER, { videoProducerId });
          if (response.error) {
            console.error("Error adding paused producer:", response.error);
          }
        }

        // Stop the raw camera stream tracks
        if (rawCameraStreamRef.current) {
          rawCameraStreamRef.current.getTracks().forEach(track => track.stop());
          rawCameraStreamRef.current = null;
        }

        // Stop any remaining video track in local preview to be fully safe
        if (localStreamRef.current && localStreamRef.current.srcObject) {
          const localStream = localStreamRef.current.srcObject as MediaStream;
          localStream.getVideoTracks().forEach(track => track.stop());
        }

        setIsVideoOn(false);
      } catch (error) {
        console.log("Video pause error:", error);
      }
    }
  };

  // Proper end call with full cleanup
  const endCall = async () => {
    console.log("📞 Ending call — cleaning up resources...");
    try {
      await sendRequest(WebSocketEventType.EXIT_ROOM, { userId }).catch(() => {});
    } catch (e) {
      console.warn("Exit room request failed (non-critical):", e);
    }

    // Close all producers
    if (videoProducerRef.current) {
      videoProducerRef.current.close();
      videoProducerRef.current = null;
    }
    if (audioProducerRef.current) {
      audioProducerRef.current.close();
      audioProducerRef.current = null;
    }

    // Stop raw camera stream directly (bypassing any filter pipelines which are now removed)
    if (rawCameraStreamRef.current) {
      rawCameraStreamRef.current.getTracks().forEach(track => track.stop());
      rawCameraStreamRef.current = null;
    }

    // Close screen share if active
    if (screenProducerRef.current) {
      screenProducerRef.current.close();
      screenProducerRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
    }

    // Close all consumers
    consumers.current.forEach(({ consumer }) => {
      consumer.close();
    });
    consumers.current.clear();
    consumedProducers.current.clear();

    // Close transports
    if (producerTransportRef.current) {
      producerTransportRef.current.close();
      producerTransportRef.current = null;
    }
    if (consumerTransportRef.current) {
      consumerTransportRef.current.close();
      consumerTransportRef.current = null;
    }

    // Stop all local media tracks (camera + mic)
    if (localStreamRef.current && localStreamRef.current.srcObject) {
      const localStream = localStreamRef.current.srcObject as MediaStream;
      localStream.getTracks().forEach(track => track.stop());
      localStreamRef.current.srcObject = null;
    }

    // Clear remote streams
    setRemoteStreams([]);

    // Disconnect socket
    socket.disconnect();

    // Navigate back to home
    console.log("✅ Call ended — navigating back to home");
    router.push('/');
  };

  const handleExitClick = () => {
    if (userId && initiatorId && userId === initiatorId) {
      setShowExitOptions(true);
    } else {
      endCall();
    }
  };

  const triggerEndCallForEveryone = async () => {
    console.log("📞 Triggering End Call for everyone...");
    setShowExitOptions(false);
    try {
      await sendRequest(WebSocketEventType.END_CALL, { userId, roomId: roomId.id });
    } catch (error) {
      console.error("Failed to end call for everyone:", error);
      toast.error("Failed to end call for everyone.");
    }
  };

  const getUserNameByProducerId = (producerId: string): string => {
    const producer = producers.find(p => p.producer_id === producerId);
    const user = usersInRoom.find(u => u.id === producer?.userId);
    return user?.name || "Unknown";
  };

  const getUserIdByProducerId = (producerId: string): string => {
    const producer = producers.find(p => p.producer_id === producerId);
    return producer?.userId || "";
  };



  return (
    <>
      <Toaster position="bottom-left" toastOptions={{ className: "border border-[var(--border-default)] bg-[var(--bg-tertiary)] text-[var(--text-primary)]", style: { background: "var(--bg-tertiary)", border: "1px solid var(--border-default)", color: "var(--text-primary)" } }} />
      <div className="min-h-screen relative p-4 md:p-6" style={{ background: "linear-gradient(145deg, var(--bg-gradient-start) 0%, var(--bg-gradient-mid) 50%, var(--bg-gradient-end) 100%)" }}>

        {/* Call type label */}
        <div className="flex justify-center mb-4">
          <span className="text-xs font-medium text-[var(--text-muted)] bg-[var(--bg-tertiary)] px-4 py-1.5 rounded-full border border-[var(--border-subtle)]">
            {isAudioOnly ? "🎙️ Voice Call" : "🎥 Video Call"}
          </span>
        </div>

        {isAudioOnly ? (
          /* ========== AUDIO-ONLY LAYOUT ========== */
          <div className="w-full flex flex-col items-center justify-center gap-8" style={{ minHeight: "calc(100vh - 180px)" }}>
            {/* Your avatar */}
            <div className="flex flex-col items-center gap-2">
              <div className={`w-24 h-24 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-white text-3xl font-bold shadow-xl shadow-indigo-500/30 ${isMicOn ? "ring-4 ring-indigo-400/40 animate-pulse-glow" : "opacity-70"}`}>
                {username?.[0]?.toUpperCase() || "?"}
              </div>
              <span className="text-sm text-[var(--text-secondary)]">{username} (You)</span>
              {!isMicOn && <span className="text-xs text-red-400 flex items-center gap-1"><MicOff className="w-3 h-3" /> Muted</span>}
            </div>

            {/* Remote participants */}
            {usersInRoom.filter(u => u.id !== userId).length === 0 ? (
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-600/20 to-purple-600/20 border border-indigo-500/20 flex items-center justify-center">
                    <Phone className="w-8 h-8 text-indigo-400 animate-float" />
                  </div>
                  <div className="absolute inset-0 rounded-full border border-indigo-500/20 animate-ping" style={{ animationDuration: "2s" }} />
                </div>
                <p className="text-[var(--text-muted)] text-sm">Waiting for others to join...</p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-6 justify-center">
                {usersInRoom.filter(u => u.id !== userId).map((user) => {
                  const isSpeaking = activeSpeakers[user.id];
                  const speakRingClass = isSpeaking 
                    ? "ring-4 ring-emerald-400 shadow-xl shadow-emerald-500/30 animate-pulse-glow scale-[1.05]" 
                    : "ring-2 ring-indigo-500/20 opacity-70 scale-100";

                  return (
                    <div key={user.id} className="flex flex-col items-center gap-2 transition-all duration-300">
                      <div className={`w-20 h-20 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-white text-2xl font-bold transition-all duration-300 ${speakRingClass}`}>
                        {user.name?.[0]?.toUpperCase() || "?"}
                      </div>
                      <span className="text-sm text-[var(--text-secondary)]">{user.name}</span>
                    </div>
                  );
                })}
              </div>
            )}

            <p className="text-[var(--text-muted)] text-xs mt-4">Connected</p>
          </div>
        ) : (
          /* ========== VIDEO CALL LAYOUT ========== */
          <div className="w-full h-full flex flex-col pt-2 pb-24 relative overflow-hidden" style={{ minHeight: "calc(100vh - 120px)" }}>
            {pinnedStreamId ? (
              /* --- PINNED SPOTLIGHT LAYOUT --- */
              <div className="flex-1 flex flex-col min-h-0 w-full h-full px-2 md:px-6 z-10">
                {/* Spotlight Main Area */}
                <div className="flex-1 w-full flex items-center justify-center min-h-0 pb-4 relative">
                   <div className="w-full h-full max-w-6xl mx-auto rounded-3xl overflow-hidden glass-strong shadow-2xl relative border border-[var(--border-subtle)] group">
                      {pinnedStreamId === "local" ? (
                         <>
                           <video autoPlay muted playsInline ref={(el) => { if (el && rawCameraStreamRef.current) el.srcObject = rawCameraStreamRef.current; }} className="w-full h-full object-cover bg-black/40" style={{ transform: "scaleX(-1)" }} />
                           {!isVideoOn && (
                             <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-tertiary)]">
                               <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-white text-4xl font-bold shadow-lg shadow-indigo-500/30">
                                 {username?.[0]?.toUpperCase() || "?"}
                               </div>
                             </div>
                           )}
                           <div className="absolute bottom-4 left-4 text-sm text-white/90 bg-black/50 px-3 py-1 rounded-lg backdrop-blur-sm">
                             {username} (You)
                           </div>
                         </>
                      ) : pinnedStreamId === "local-screen" ? (
                         <>
                           <video autoPlay muted playsInline ref={(el) => { if (el && screenStreamRef.current) el.srcObject = screenStreamRef.current; }} className="w-full h-full object-contain bg-black/40" />
                           <div className="absolute bottom-4 left-4 text-sm text-white/90 bg-emerald-600/80 px-3 py-1 rounded-lg backdrop-blur-sm">
                             Your Screen Share
                           </div>
                         </>
                      ) : (
                         (() => {
                           const rs = remoteStream.find(s => s.producerId === pinnedStreamId && s.kind === "video");
                           if (!rs) return <div className="absolute inset-0 flex items-center justify-center text-white bg-black/40">Stream closed</div>;
                           const userName = getUserNameByProducerId(rs.producerId);
                           const isScreen = rs.appData?.isScreenShare;
                           const displayName = isScreen ? `${userName} (Screen Share)` : userName;
                           const isPaused = pausedVideoProducerIds.includes(rs.producerId);
                           return (
                             <>
                               <RemoteVideo stream={rs.stream} producerId={rs.producerId} userName={displayName} userInitial={userName?.[0]?.toUpperCase() || "?"} isPaused={isPaused} />
                               <div className="absolute bottom-4 left-4 flex items-center gap-2 z-10">
                                 <span className="text-sm text-white bg-black/50 px-3 py-1 rounded-lg backdrop-blur-sm">{displayName}</span>
                               </div>
                             </>
                           );
                         })()
                      )}
                      
                      {/* Unpin Button Overlay */}
                      <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-20">
                        <button onClick={() => setPinnedStreamId(null)} className="p-3 rounded-xl bg-black/60 hover:bg-red-500/80 text-white backdrop-blur-md shadow-lg transition-all cursor-pointer" title="Unpin Stream">
                           <PinOff size={20} />
                        </button>
                      </div>
                   </div>
                </div>

                {/* Bottom Carousel (Remaining Participants) */}
                <div className="h-36 md:h-44 w-full overflow-x-auto flex gap-4 pb-2 px-2 items-center custom-scrollbar">
                   {/* Local Camera Card */}
                   {pinnedStreamId !== "local" && (
                     <div className="h-full aspect-video rounded-2xl overflow-hidden glass-strong relative group flex-shrink-0 cursor-pointer border border-[var(--border-subtle)] hover:border-indigo-500/50 transition-all duration-300"
                          onClick={() => setPinnedStreamId("local")}>
                        <video autoPlay muted playsInline ref={(el) => { if (el && rawCameraStreamRef.current) el.srcObject = rawCameraStreamRef.current; }} className="w-full h-full object-cover bg-black/40" style={{ transform: "scaleX(-1)" }} />
                        {!isVideoOn && (
                          <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-tertiary)]">
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-indigo-500/30">
                              {username?.[0]?.toUpperCase() || "?"}
                            </div>
                          </div>
                        )}
                        <div className="absolute bottom-2 left-2 text-xs text-white/90 bg-black/50 px-2 py-0.5 rounded-md backdrop-blur-sm">
                          {username} (You)
                        </div>
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10">
                           <button className="p-2 bg-indigo-600 text-white rounded-full"><Pin size={18} /></button>
                        </div>
                     </div>
                   )}

                   {/* Local Screen Share Card */}
                   {isScreenSharing && pinnedStreamId !== "local-screen" && (
                     <div className="h-full aspect-video rounded-2xl overflow-hidden glass-strong relative group flex-shrink-0 cursor-pointer border border-emerald-500/30 hover:border-emerald-400 transition-all duration-300"
                          onClick={() => setPinnedStreamId("local-screen")}>
                        <video autoPlay muted playsInline ref={(el) => { if (el && screenStreamRef.current) el.srcObject = screenStreamRef.current; }} className="w-full h-full object-cover bg-black/40" />
                        <div className="absolute bottom-2 left-2 text-xs text-white/90 bg-emerald-600/80 px-2 py-0.5 rounded-md backdrop-blur-sm">
                          Your Screen Share
                        </div>
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10">
                           <button className="p-2 bg-emerald-600 text-white rounded-full"><Pin size={18} /></button>
                        </div>
                     </div>
                   )}

                   {/* Remote Streams Cards */}
                   {remoteStream.filter(({ kind }) => kind === "video").map(({ stream, producerId, appData }) => {
                     if (pinnedStreamId === producerId) return null; // Skip if it's currently pinned
                     const userName = getUserNameByProducerId(producerId);
                     const isScreen = appData?.isScreenShare;
                     const displayName = isScreen ? `${userName} (Screen)` : userName;
                     const isPaused = pausedVideoProducerIds.includes(producerId);
                     return (
                       <div key={`carousel-${producerId}`} 
                            className="h-full aspect-video rounded-2xl overflow-hidden glass-strong relative group flex-shrink-0 cursor-pointer border border-[var(--border-subtle)] hover:border-indigo-500/50 transition-all duration-300"
                            onClick={() => setPinnedStreamId(producerId)}>
                         <RemoteVideo stream={stream} producerId={producerId} userName={displayName} userInitial={userName?.[0]?.toUpperCase() || "?"} isPaused={isPaused} />
                         <div className="absolute bottom-2 left-2 z-10">
                           <span className="text-xs text-white bg-black/50 px-2 py-0.5 rounded-md backdrop-blur-sm">{displayName}</span>
                         </div>
                         <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20">
                            <button className="p-2 bg-indigo-600 text-white rounded-full"><Pin size={18} /></button>
                         </div>
                       </div>
                     );
                   })}
                </div>
              </div>
            ) : (
              /* --- BALANCED GRID LAYOUT --- */
              <>
                {/* Local Camera and Screen floating when no stream is pinned (traditional feel) */}
                <section className="fixed bottom-24 right-4 md:right-6 z-40 flex flex-col gap-3">
                  {/* Screen Share Preview */}
                  {isScreenSharing && (
                    <div className="w-44 md:w-56 rounded-2xl overflow-hidden shadow-2xl glass-strong border border-emerald-500/30 relative group cursor-pointer hover:scale-105 transition-all duration-300"
                         onClick={() => setPinnedStreamId("local-screen")}>
                      <video autoPlay muted playsInline ref={(el) => { if (el && screenStreamRef.current) el.srcObject = screenStreamRef.current; }} className="w-full h-full object-contain bg-black/40" />
                      <div className="absolute bottom-2 left-2 text-[10px] text-white/90 bg-emerald-600/80 px-2 py-0.5 rounded-md backdrop-blur-sm">
                        Your Screen Share
                      </div>
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10">
                         <button className="p-2 bg-indigo-600 text-white rounded-full"><Pin size={16} /></button>
                      </div>
                    </div>
                  )}

                  {/* Camera Video Preview */}
                  <div className={`w-44 md:w-56 rounded-2xl overflow-hidden shadow-2xl glass-strong relative group cursor-pointer transition-all duration-300 hover:scale-105 ${userId && activeSpeakers[userId] ? "ring-4 ring-emerald-500 shadow-emerald-500/20 scale-[1.02]" : "ring-0"}`}
                       onClick={() => setPinnedStreamId("local")}>
                    <video autoPlay muted playsInline ref={(el) => { if (el && rawCameraStreamRef.current) el.srcObject = rawCameraStreamRef.current; }} className="w-full h-full object-cover bg-black/40" style={{ transform: "scaleX(-1)" }} />
                    {!isVideoOn && (
                      <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-tertiary)]">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-indigo-500/30">
                          {username?.[0]?.toUpperCase() || "?"}
                        </div>
                      </div>
                    )}
                    <div className="absolute bottom-2 left-2 text-[10px] text-white/90 bg-black/50 px-2 py-0.5 rounded-md backdrop-blur-sm">
                      {username} (You)
                    </div>
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10">
                       <button className="p-2 bg-indigo-600 text-white rounded-full"><Pin size={16} /></button>
                    </div>
                  </div>
                </section>

                {/* Remote Streams Grid */}
                <div className="w-full flex flex-wrap gap-4 px-0 md:px-4 justify-center items-center h-full">
                  {(() => {
                    const videoStreams = remoteStream.filter(({ kind }) => kind === "video");
                    if (videoStreams.length === 0) {
                      return (
                        <div className="w-full flex flex-col items-center justify-center gap-6 h-[60vh]">
                          <div className="relative">
                            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-600/20 to-purple-600/20 border border-indigo-500/20 flex items-center justify-center">
                              <Phone className="w-10 h-10 text-indigo-400 animate-float" />
                            </div>
                            <div className="absolute inset-0 rounded-full border border-indigo-500/20 animate-ping" style={{ animationDuration: "2s" }} />
                            <div className="absolute -inset-4 rounded-full border border-indigo-500/10 animate-ping" style={{ animationDuration: "2.5s", animationDelay: "0.5s" }} />
                          </div>
                          <div className="text-center">
                            <p className="text-xl font-semibold text-[var(--text-primary)]">Waiting for others...</p>
                            <p className="text-sm text-[var(--text-muted)] mt-1">Share this room link to connect</p>
                          </div>
                        </div>
                      );
                    }
                    return videoStreams.map(({ stream, producerId, appData }) => {
                      const userName = getUserNameByProducerId(producerId);
                      const rUserId = getUserIdByProducerId(producerId);
                      const isScreen = appData?.isScreenShare;
                      const displayName = isScreen ? `${userName} (Screen Share)` : userName;
                      const userInitial = userName?.[0]?.toUpperCase() || "?";
                      const isSpeaking = !isScreen && rUserId && activeSpeakers[rUserId];
                      const speakerRingClass = isSpeaking ? "ring-4 ring-emerald-500 shadow-emerald-500/20 scale-[1.01]" : "ring-0";
                      const isPaused = pausedVideoProducerIds.includes(producerId);

                      return (
                        <div key={`remote-${producerId}-${stream.id}`} 
                          className={`relative rounded-2xl overflow-hidden glass-strong shadow-2xl flex-1 transition-all duration-300 group cursor-pointer ${speakerRingClass}`}
                          style={{ minWidth: videoStreams.length === 1 ? "100%" : "45%", maxWidth: videoStreams.length === 1 ? "100%" : videoStreams.length <= 4 ? "48%" : "30%", aspectRatio: "16/9" }}
                          onClick={() => setPinnedStreamId(producerId)}>
                          <RemoteVideo stream={stream} producerId={producerId} userName={displayName} userInitial={userInitial} isPaused={isPaused} />
                          <div className="absolute bottom-3 left-3 flex items-center gap-2 z-10">
                            <span className="text-sm text-white bg-black/50 px-3 py-1 rounded-lg backdrop-blur-sm">{displayName}</span>
                          </div>
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20">
                             <button className="p-3 bg-indigo-600 text-white rounded-full shadow-lg"><Pin size={24} /></button>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </>
            )}
          </div>
        )}

        {/* Control Bar — glass pill */}
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 flex gap-3 glass-strong px-6 py-3 rounded-2xl shadow-2xl">
          <button onClick={turnMicOn}
            className={`p-3.5 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer ${isMicOn ? "bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]" : "bg-red-500/15 text-red-400 border border-red-500/20"}`}
            title="Toggle Mic">
            {isMicOn ? <Mic size={20} /> : <MicOff size={20} />}
          </button>

          <button onClick={handleExitClick}
            className="px-6 py-3.5 rounded-xl bg-red-600 hover:bg-red-500 text-white transition-all duration-200 hover:scale-105 active:scale-95 shadow-lg shadow-red-500/20 cursor-pointer"
            title="End Call">
            <Phone size={20} />
          </button>

          {!isAudioOnly && (
            <>
              <button onClick={turnVideoOn}
                className={`p-3.5 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer ${isVideoOn ? "bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]" : "bg-red-500/15 text-red-400 border border-red-500/20"}`}
                title="Toggle Video">
                {isVideoOn ? <Video size={20} /> : <VideoOff size={20} />}
              </button>

              <button onClick={toggleScreenShare}
                className={`p-3.5 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer ${isScreenSharing ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"}`}
                title="Share Screen">
                <Monitor size={20} />
              </button>
            </>
          )}
        </div>

        {/* Remote Audio Streams */}
        <section>
          {remoteStream?.filter(({ kind }) => kind === "audio").map(({ stream }, index) => (
            <div key={index} className="hidden">
              <audio autoPlay ref={(el) => { if (el) el.srcObject = stream; }} />
            </div>
          ))}
        </section>

        {showExitOptions && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-default)] rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl relative">
              <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Exit Call</h3>
              <p className="text-sm text-[var(--text-secondary)] mb-6">
                You are the initiator of this call. Would you like to end the call for all participants, or just leave?
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-end">
                <button onClick={() => setShowExitOptions(false)} className="px-4 py-2 text-sm font-medium rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] cursor-pointer">Cancel</button>
                <button onClick={endCall} className="px-4 py-2 text-sm font-medium rounded-xl bg-[var(--bg-tertiary)] hover:bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-primary)] cursor-pointer">Just Leave</button>
                <button onClick={triggerEndCallForEveryone} className="px-4 py-2 text-sm font-medium rounded-xl bg-red-600 hover:bg-red-500 text-white cursor-pointer shadow-lg shadow-red-500/20">End for Everyone</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );


}