#!/bin/bash
# ==============================================================================
#  BhashaBridge - Sovereign Full-Stack Shutdown Script
# ==============================================================================

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$ROOT_DIR/logs"

echo "=================================================================="
echo "   🛑 Stopping BhashaBridge Services..."
echo "=================================================================="

# Function to kill PID from file
stop_pid() {
  local service_name="$1"
  local pid_file="$LOG_DIR/${service_name}.pid"
  if [ -f "$pid_file" ]; then
    local pid=$(cat "$pid_file")
    if kill -0 "$pid" 2>/dev/null; then
      echo "Stopping $service_name (PID: $pid)..."
      kill "$pid" 2>/dev/null || true
    fi
    rm -f "$pid_file"
  fi
}

stop_pid "frontend"
stop_pid "backend"
stop_pid "sfu-service"
stop_pid "ai-service"

# Kill any leftover node processes on those ports
for port in 3000 5000 5001 5002; do
  fuser -k "${port}/tcp" 2>/dev/null || true
done

echo ""
echo "[✓] All Node.js services stopped successfully."
echo "Note: The GPU AI Engine container on :8000 is still active in Docker."
echo "If you also want to stop the Docker AI Engine, run: cd ai-engine && docker compose down"
echo "=================================================================="
