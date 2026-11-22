# BhashaBridge Cognitive AI Microservice Dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production || npm install --production

# Copy source code and Avro schemas
COPY . .

# Expose microservice HTTP & Avro binary port
EXPOSE 5001

ENV NODE_ENV=production
ENV AI_SERVICE_PORT=5001

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:5001/health || exit 1

CMD ["npm", "start"]

