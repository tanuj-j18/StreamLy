# RealMe: The Global Deployment Masterplan

This document is for your personal reference. It breaks down exactly what it takes to deploy StreamLy for global, production-level usage, the costs involved, and how to hack the system to do it as cheaply as possible without sacrificing the core functionality.

---

## 1. The True Requirements (What MUST be running)

StreamLy is a heavy application. Unlike a simple blog, you have permanent, stateful connections and intense media routing. Here is what absolutely must exist in the cloud:

1.  **Frontend (Next.js)**: Needs to be hosted, preferably on an Edge network (CDN) for fast global loading.
2.  **Backend (Node.js + Mediasoup SFU)**: *CRITICAL*. This cannot be serverless. WebRTC/Mediasoup requires a long-running, stateful server with open UDP ports to route video packets continuously.
3.  **PostgreSQL**: Needs to be highly available to store users and chats.
4.  **Redis (Pub/Sub)**: Needed for Socket.io to sync messages if you have more than one backend server.
5.  **Kafka**: Needed to batch-save messages asynchronously.
6.  **AWS S3**: For image/media storage.
7.  **STUN/TURN Servers**: WebRTC requires these to punch through firewalls and NATs so users can connect their video streams globally.

---

## 2. The Traditional "Expensive" Route (Native AWS)

If a well-funded startup were building this, they would use native AWS services. It is rock-solid but very expensive.

*   **Backend / SFU**: AWS EC2 Instances (e.g., `c6g.large` or `t4g.xlarge` for CPU-heavy video routing). Auto-scaling groups and Security Groups opening specific UDP port ranges (e.g., 20000-30000). *(Cost: $60 - $150+/month)*
*   **Database**: Amazon RDS for PostgreSQL. *(Cost: $30 - $50/month)*
*   **Redis**: Amazon ElastiCache. *(Cost: $15 - $30/month)*
*   **Kafka**: Amazon MSK (Managed Streaming for Kafka). *(Cost: $150+/month)*
*   **Frontend**: AWS Amplify or Vercel. *(Cost: $20/month)*
*   **STUN/TURN**: Twilio Network Traversal or custom Coturn on EC2. *(Cost: variable, based on bandwidth)*
*   **Total Estimated Cost**: **$300 - $500+ / month** just to keep the lights on globally.

---

## 3. The "Hacker/Budget" Route (How to do this for cheap)

You do not need to spend $500/month. By combining modern serverless platforms with cheap VPS (Virtual Private Server) providers, you can drop this cost dramatically.

### A. The Frontend: Vercel or Cloudflare Pages (Cost: $0 to $20/mo)
Deploy the Next.js frontend to Vercel. It provides an automatic SSL certificate, global CDN distribution, and CI/CD directly from GitHub. The free tier is incredibly generous.

### B. The Backend (Node.js + SFU): Hetzner or DigitalOcean (Cost: $5 to $20/mo)
Do **not** use AWS EC2 for your backend if you are on a budget. AWS charges a premium for bandwidth and compute.
*   **Hetzner**: You can get an ARM64 server with 4 Cores and 8GB RAM for about **$5-$7/month**. This is a beast and will easily run your Node.js + Mediasoup backend.
*   **DigitalOcean**: Droplets start at $5-$10/month.
*   *Security*: You will configure `ufw` (Uncomplicated Firewall) on Ubuntu to open TCP port 443 (for Socket.io) and UDP ports `20000-30000` (for Mediasoup WebRTC).

### C. Database (Postgres): Supabase or Neon (Cost: $0/mo)
Do not host your own Postgres or use AWS RDS.
*   Use **Supabase** or **Neon.tech**. Both offer generous free tiers for managed PostgreSQL databases. They give you a connection string (`postgresql://...`) that you just drop into your backend `.env`.

### D. Redis & Kafka: Upstash (Cost: $0/mo)
Running Redis and Kafka 24/7 is historically expensive. **Upstash** changed this.
*   Upstash offers Serverless Redis and Serverless Kafka.
*   You pay per request. The free tier gives you 10,000 messages a day for free.
*   You get connection URLs to drop straight into your backend.

### E. Domain and SSL (Cost: $10/year)
*   Buy a cheap domain on Namecheap or Cloudflare.
*   Use **Cloudflare** for DNS management (Free).
*   For your backend VPS, use **Nginx** as a reverse proxy and **Certbot (Let's Encrypt)** to generate a free SSL certificate. WebRTC and `getUserMedia` (Camera access) **strictly require HTTPS/WSS**.

### F. STUN/TURN Servers (Cost: $0 to $2/mo)
For video calls to work across different cellular networks and corporate firewalls, you need a TURN server.
*   **Free**: Google provides free STUN servers (`stun:stun.l.google.com:19302`), which handles 80% of connections.
*   **Cheap TURN**: Use **Metered.ca** or **Twilio TURN**. They offer generous free tiers (e.g., 50GB free bandwidth) specifically for WebRTC video relay.

---

## 4. The Step-by-Step Cheap Deployment Playbook

If you want to deploy tomorrow, follow this exact stack:

1.  **Frontend**: Vercel (Free)
2.  **Database**: Neon.tech Postgres (Free)
3.  **Redis & Kafka**: Upstash (Free)
4.  **AWS S3**: Use AWS S3 free tier, or switch to Cloudflare R2 (much cheaper bandwidth, S3-compatible).
5.  **Backend Server**: Rent a $7/month Hetzner Ubuntu server.
    *   Point `api.yourdomain.com` to the Hetzner IP.
    *   Install Docker and Docker Compose on the Hetzner server.
    *   Copy your backend code to the server.
    *   Run Nginx to route `api.yourdomain.com` to your Node.js container (Port 5000).
    *   Run Certbot to secure it with WSS/HTTPS.
    *   Ensure UDP ports 20000-30000 are open in Hetzner's firewall panel.

**Total Cost**: ~$7 to $10 a month. 
**Scalability**: This setup will comfortably support hundreds of simultaneous active users before you ever need to pay more.
