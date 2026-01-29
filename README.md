<div align="center">
  <!-- [PLACEHOLDER: Insert StreamLy Logo Image here] -->
  <img src="https://via.placeholder.com/150x150?text=StreamLy+Logo" alt="StreamLy Logo" width="120" />

  <h1>🌊 StreamLy: The Ultimate Real-Time Multimedia Platform</h1>
  <p><strong>An exhaustive, enterprise-grade, highly scalable, real-time multimedia communication platform engineered for scale, minimal latency, and massive group interactions.</strong></p>
  
  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
  [![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
  [![Next.js](https://img.shields.io/badge/Next.js-black?style=flat&logo=next.js&logoColor=white)](https://nextjs.org/)
  [![Mediasoup](https://img.shields.io/badge/Mediasoup-SFU-FF4500?style=flat)](https://mediasoup.org/)
  [![Kafka](https://img.shields.io/badge/Apache_Kafka-231F20?style=flat&logo=apache-kafka&logoColor=white)](https://kafka.apache.org/)
  [![Redis](https://img.shields.io/badge/Redis-DC382D?style=flat&logo=redis&logoColor=white)](https://redis.io/)
</div>

<br />

<!-- [PLACEHOLDER: Insert a high-quality GIF or Screenshot of the StreamLy video call interface (Spotlight Layout) here] -->
> **[NOTE FOR MEHAR: Replace this block with a stunning GIF showing the UI handling a large group call]**
> `![StreamLy Video Call Demo](./docs/assets/demo.gif)`

---

## 📖 Executive Summary & Vision

StreamLy is not just another video calling application; it is a meticulously engineered, full-stack monorepo designed to solve the hardest problems in real-time communication: **State Synchronization, Video Bandwidth Scaling, and Database Write Contention.**

When handling large group chats and multi-party video calls, traditional architectures collapse under quadratic bandwidth scaling and massive database locking. StreamLy resolves this by decoupling the presentation layer from the persistence layer, utilizing a **Selective Forwarding Unit (SFU)** for video, **Redis** for instantaneous volatile state synchronization across horizontally scaled nodes, and **Apache Kafka** for asynchronous, high-throughput permanent ledger writes to **PostgreSQL**.

This README provides a comprehensive overview of the system. For deep-dive theoretical and practical implementation details, consult the exhaustive documentation in the `docs/` directory.

---

## 🚀 Exhaustive Feature Breakdown

### 1. Advanced Multi-Party Video & Voice Calling (SFU Architecture)
- **Mediasoup Integration**: StreamLy uses Mediasoup, a cutting-edge C++ WebRTC SFU (Selective Forwarding Unit) wrapped in Node.js bindings. Instead of a Mesh topology where bandwidth usage explodes exponentially ($O(N^2)$), Mediasoup allows linear scaling ($O(N)$) by receiving a single stream from a client and forwarding it to the group.
- **Dynamic Bandwidth Management**: Capable of handling spatial and temporal layer routing, adapting video quality dynamically based on the receiver's network conditions.
- **Group Handling Capability**: Designed to support dozens of participants in a single virtual room with minimal CPU and memory overhead on the client devices.

### 2. Premium Dynamic UI & Spotlight Screen Sharing
- **Spotlight Pinned View**: A bespoke, Next.js/Tailwind-powered layout that dynamically adapts. When a user pins a stream, or someone shares their screen, the system elegantly maximizes the focused stream to the primary viewport while seamlessly animating all other participants into a responsive, scrollable bottom carousel.
- **Native Stream Processing**: By intentionally bypassing heavy HTML5 `<canvas>` rendering loops, StreamLy binds raw `MediaStream` tracks directly to native `<video>` elements, guaranteeing zero tab-suspension freezing on Chromium browsers and extreme battery efficiency.

### 3. Real-Time Massive Group Messaging
- **Instant Global Delivery**: Powered by `socket.io`, ensuring single-digit millisecond latency for message delivery across the globe.
- **Redis Pub/Sub Sync**: In a microservice environment, users in the same group chat might connect to different physical servers. Redis Pub/Sub acts as the central nervous system, instantly broadcasting events across all horizontally scaled Node.js instances so group chats remain perfectly synchronized.
- **Kafka-Backed Asynchronous Persistence**: To prevent database lockups during heavy group chat activity (e.g., 50 messages per second), Socket.io dumps payloads into an Apache Kafka topic. A background consumer efficiently batches these writes into PostgreSQL without blocking the main event loop.

### 4. Precision Group Notification System
- **Unseen Message Tracking**: StreamLy abandons the naive, database-heavy approach of tracking read-status per message per user. Instead, it utilizes an ultra-efficient `lastSeenAt` cursor and `unseenCount` incrementer per `Participant` record, allowing instant, accurate read receipts and badge counts even in groups with thousands of messages.

### 5. Media Cloud Storage
- **AWS S3 Integration**: Secure, scalable storage for profile pictures, chat images, and shared media, utilizing Pre-signed URLs for secure, direct-to-cloud uploads bypassing the Node.js server.

---

## 🧠 Comprehensive System Architecture

StreamLy’s architecture represents a decoupled, event-driven monolith ready for microservice extraction.

```mermaid
flowchart TD
    ClientA["Client A (Next.js)"]
    ClientB["Client B (Next.js)"]
    ClientC["Client C (Next.js)"]

    subgraph "Node.js Backend Layer"
        API["Express API Gateway"]
        SocketServer["Socket.io Server"]
        Mediasoup["Mediasoup SFU Worker"]
    end

    subgraph "Volatile Cache & Sync"
        Redis[("Redis Pub/Sub & Cache")]
    end

    subgraph "Asynchronous Persistence"
        Kafka["Apache Kafka Broker"]
        KafkaConsumer["Background Consumer"]
        Postgres[("PostgreSQL DB")]
    end

    S3[("AWS S3 / Cloudflare R2")]

    ClientA -->|WSS| SocketServer
    SocketServer -->|WSS| ClientA
    ClientB -->|WSS| SocketServer
    SocketServer -->|WSS| ClientB
    ClientC -->|WSS| SocketServer
    SocketServer -->|WSS| ClientC

    ClientA -->|RTP/RTCP UDP| Mediasoup
    Mediasoup -->|RTP/RTCP UDP| ClientA
    ClientB -->|RTP/RTCP UDP| Mediasoup
    Mediasoup -->|RTP/RTCP UDP| ClientB

    ClientA -->|HTTPS Uploads| S3

    SocketServer -->|Broadcasts| Redis
    Redis -->|Broadcasts| SocketServer
    SocketServer -->|Produces Event| Kafka
    Kafka -->|Consumes| KafkaConsumer
    KafkaConsumer -->|Batch Insert| Postgres
    API -->|Reads/Writes| Postgres
    Postgres -->|Reads/Writes| API
```

### Deep Dive Documentation Directory
For a complete, theoretical, and practical understanding of how this code works, please review the exhaustive documentation files:
1. **[System Architecture & UMLs](./docs/ARCHITECTURE.md)**: Deep dive into the monorepo structure, component boundaries, and horizontal scaling.
2. **[Database Schema & ER Diagrams](./docs/DATABASE_SCHEMA.md)**: Exhaustive breakdown of the Prisma ORM schema, relations, and the genius behind the unseen notification logic.
3. **[WebRTC & SFU Implementation](./docs/WEBRTC_SFU_IMPLEMENTATION.md)**: The state machine of a Mediasoup connection, transport logic, and the Pinned Spotlight UI architecture.
4. **[Messaging & Kafka Architecture](./docs/MESSAGING_AND_KAFKA.md)**: How StreamLy handles massive group chats without melting the database.

---

## 🚶‍♂️ User Workflows & Group Handling

StreamLy is built heavily around the concept of **Groups** (Chats/Rooms).

### Workflow: Group Chat Creation & Join
1. **Initiation**: User creates a Group Chat via the frontend UI.
2. **Database Execution**: The Express API creates a `Chat` record with `isGroupChat = true`, sets the creator as the `admin`, and creates `Participant` junction records.
3. **Socket Emittance**: When users open the chat, they emit a `JOIN_ROOM` event. The Socket Server subscribes them to a specific Socket.io Room mapped directly to the `Chat.id`.

### Workflow: Group Video Call
1. **Signaling**: When a user clicks "Call", an event is broadcast to the group via Redis.
2. **SFU Negotiation**: Users accept the call. The Next.js client requests a WebRTC Transport from the Node.js Mediasoup Router.
3. **Producer/Consumer Matrix**: In a group of 5, when User A speaks, User A creates 1 `Producer` for audio and 1 for video. The Mediasoup server instantly creates 4 `Consumer` objects to route that exact media to Users B, C, D, and E. 
4. **UI Adaptation**: The frontend continuously listens to `newConsumer` events, appending the native `MediaStream` to the flexible flexbox grid, dynamically resizing based on the number of participants.

---

## 📦 Exhaustive Getting Started Guide

### Prerequisites
- **Node.js**: v18+ recommended
- **Docker & Docker Compose**: Required for running Redis, Kafka, Zookeeper, and PostgreSQL locally.
- **C++ Build Tools & Python 3**: Required specifically for building the `mediasoup` native C++ bindings on Windows. Without this, `npm install` in the backend will fail.

### 1. Spin up the Infrastructure (Docker)
StreamLy requires a robust data plane. We provide a Docker Compose file to orchestrate this.

```bash
cd backend
docker-compose up -d
```
*Verify containers are healthy. Ports 5433 (Postgres), 6380 (Redis), 2181 (Zookeeper), and 9092/9093 (Kafka) must be accessible.*

### 2. Environment Variables Configuration
Copy `.env.example` in both directories to `.env` (backend) and `.env.local` (frontend).

**Backend** (`backend/.env`):
```env
DATABASE_URL="postgresql://user:password@localhost:5433/streamly?schema=public"
REDIS_URL="redis://localhost:6380"
KAFKA_BROKER="localhost:9092"
JWT_SECRET="your_highly_secure_cryptographic_key_here"
# Optional for Media
AWS_ACCESS_KEY_ID="your_aws_key"
AWS_SECRET_ACCESS_KEY="your_aws_secret"
AWS_REGION="us-east-1"
AWS_S3_BUCKET_NAME="streamly-media-storage"
```

**Frontend** (`frontend/.env.local`):
```env
NEXT_PUBLIC_API_URL=http://localhost:5000
NEXT_PUBLIC_SOCKET_URL=http://localhost:5000
```

### 3. Backend Execution
Initialize the database schema, generate the ORM client, and compile the C++ SFU bindings.

```bash
cd backend
npm install
npx prisma generate
npx prisma db push

# Windows Only - Rebuild Mediasoup C++ worker to generate the .node binary
npm rebuild mediasoup

# Boot the API, Socket Server, Kafka Consumers, and Mediasoup Workers
npm run dev
```

### 4. Frontend Execution
```bash
cd frontend
npm install
npm run dev
```
Navigate to `http://localhost:3000` to experience StreamLy.

---

## 🤝 Contributing & License
We welcome exhaustive contributions to documentation, test coverage, and core logic. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for details.

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
