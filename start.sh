#!/bin/bash
# ==============================================================================
#  BhashaBridge - Sovereign Full-Stack Launcher
# ==============================================================================
# Services Started:
#   1. AI Engine (GPU Docker)   -> http://localhost:8000
#   2. AI Microservice (Avro)   -> http://localhost:5001
#   3. Mediasoup SFU Service    -> http://localhost:5002
#   4. Express Backend API      -> http://localhost:5000
#   5. Next.js Frontend         -> http://localhost:3000
# ==============================================================================

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$ROOT_DIR/logs"
mkdir -p "$LOG_DIR"

echo "=================================================================="
echo "   🚀 Starting BhashaBridge Sovereign Platform..."
echo "=================================================================="

# 1. Start AI Engine (Docker) if not already up
echo "[1/5] Ensuring Sovereign AI Engine (Docker) is running on :8000..."
cd "$ROOT_DIR/ai-engine"
docker compose up -d
sleep 2

# 2. Start AI Microservice (Port 5001)
echo "[2/5] Starting AI Microservice (Avro) on :5001..."
cd "$ROOT_DIR/ai-service"
AI_SERVICE_PORT=5001 nohup node src/server.js > "$LOG_DIR/ai-service.log" 2>&1 &
echo $! > "$LOG_DIR/ai-service.pid"

# 3. Start Mediasoup SFU Service (Port 5002)
echo "[3/5] Starting Mediasoup SFU Router on :5002..."
cd "$ROOT_DIR/sfu-service"
SFU_PORT=5002 nohup node src/server.js > "$LOG_DIR/sfu-service.log" 2>&1 &
echo $! > "$LOG_DIR/sfu-service.pid"

# 4. Start Main Backend (Port 5000)
echo "[4/5] Starting Main Backend (REST + Socket.IO) on :5000..."
cd "$ROOT_DIR/backend"
PORT=5000 nohup node src/server.js > "$LOG_DIR/backend.log" 2>&1 &
echo $! > "$LOG_DIR/backend.pid"

# 5. Start Frontend (Port 3000)
echo "[5/5] Starting Next.js Web Application on :3000..."
cd "$ROOT_DIR/frontend"
nohup npm run dev > "$LOG_DIR/frontend.log" 2>&1 &
echo $! > "$LOG_DIR/frontend.pid"

echo ""
echo "=================================================================="
echo "   🎉 All BhashaBridge Services are LIVE!"
echo "=================================================================="
echo "  🖥️  Frontend Web App : http://localhost:3000"
echo "  📡  Main Backend API : http://localhost:5000"
echo "  🧠  AI Microservice  : http://localhost:5001"
echo "  📹  Mediasoup SFU    : http://localhost:5002"
echo "  ⚡  GPU AI Engine    : http://localhost:8000"
echo "=================================================================="
echo "Logs are available in: $LOG_DIR/"
echo "To stop all services later, simply run: ./stop.sh"
echo "=================================================================="
