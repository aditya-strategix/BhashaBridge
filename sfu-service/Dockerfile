# Production Dockerfile for BhashaBridge Mediasoup SFU Media Router
FROM node:22-bookworm-slim AS base

# Install C/C++ compilation tools and Python for native mediasoup worker
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    build-essential \
    pkg-config \
    libssl-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency manifests
COPY package.json ./

# Install dependencies (ignoring optional mediasoup failures on minimal architectures)
RUN npm install --omit=dev || npm install --omit=dev --ignore-scripts

# Copy source code
COPY . .

# Expose signaling port and WebRTC UDP/TCP media port range
EXPOSE 5002
EXPOSE 40000-40100/udp
EXPOSE 40000-40100/tcp

ENV SFU_PORT=5002
ENV SFU_HOST=0.0.0.0
ENV MEDIASOUP_LISTEN_IP=0.0.0.0
ENV RTC_MIN_PORT=40000
ENV RTC_MAX_PORT=40100

CMD ["node", "src/server.js"]
