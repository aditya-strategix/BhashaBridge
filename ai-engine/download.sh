#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODELS_DIR="$SCRIPT_DIR/models"
mkdir -p "$MODELS_DIR"

echo "=================================================================="
echo "  BhashaBridge - Sovereign AI Model Downloader (Docker Powered)  "
echo "=================================================================="
echo "Destination: $MODELS_DIR"
echo ""
echo "Models to download:"
echo " 1. Text-to-Text: IndicTrans2 Distilled 200M (AI4Bharat / 22 Indian Languages)"
echo " 2. STT: Faster-Whisper Small (Real-time Speech Recognition)"
echo " 3. TTS: Bhashini Indic-TTS (AI4Bharat / IIT Madras Official Sovereign Voice)"
echo " 4. TTS Text-Encoder Tokenizer: FLAN-T5 Large (voice description tokens)"
echo "=================================================================="

# Load token from backend/.env if available
HF_TOKEN="${HF_TOKEN:-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}"

# Use Docker to run the download so zero Python setup is needed on your host!
docker run --rm \
  -v "$MODELS_DIR":/models \
  -e HF_TOKEN="$HF_TOKEN" \
  python:3.11-slim \
  bash -c '
    set -e
    echo "[1/5] Installing huggingface_hub inside temporary container..."
    pip install --no-cache-dir -q huggingface_hub

    echo "[2/5] Downloading Text-to-Text: IndicTrans2 (ai4bharat/indictrans2-en-indic-dist-200M)..."
    python -c "
import os
from huggingface_hub import snapshot_download
token = os.getenv(\"HF_TOKEN\")
snapshot_download(
    repo_id=\"ai4bharat/indictrans2-en-indic-dist-200M\",
    local_dir=\"/models/indictrans2-200M\",
    token=token,
    ignore_patterns=[\"*.msgpack\", \"*.h5\", \"*.ot\", \"flax_model.msgpack\"]
)
print(\"[✓] IndicTrans2 downloaded successfully!\")
"

    echo "[3/5] Downloading STT: Faster-Whisper Small (Systran/faster-whisper-small)..."
    python -c "
import os
from huggingface_hub import snapshot_download
token = os.getenv(\"HF_TOKEN\")
snapshot_download(
    repo_id=\"Systran/faster-whisper-small\",
    local_dir=\"/models/whisper-small\",
    token=token
)
print(\"[✓] Faster-Whisper Small downloaded successfully!\")
"

    echo "[4/5] Downloading TTS: Official Bhashini Indic-TTS (ai4bharat/indic-parler-tts)..."
    python -c "
import os
from huggingface_hub import snapshot_download
token = os.getenv(\"HF_TOKEN\")
snapshot_download(
    repo_id=\"ai4bharat/indic-parler-tts\",
    local_dir=\"/models/indic-parler-tts\",
    token=token,
    ignore_patterns=[\"*.msgpack\", \"*.h5\", \"*.ot\"]
)
print(\"[✓] Bhashini Indic-TTS downloaded successfully!\")
"
    echo "[5/5] Downloading TTS text-encoder tokenizer (google/flan-t5-large)..."
    python -c "
import os
from huggingface_hub import snapshot_download
token = os.getenv(\"HF_TOKEN\")
snapshot_download(
    repo_id=\"google/flan-t5-large\",
    local_dir=\"/models/flan-t5-large\",
    token=token,
    allow_patterns=[\"tokenizer*\", \"spiece.model\", \"special_tokens_map.json\", \"config.json\"]
)
print(\"[✓] FLAN-T5 Large tokenizer downloaded successfully!\")
"
    echo ""
    echo "=================================================================="
    echo " All sovereign models downloaded and cached in models/ directory!"
    echo "=================================================================="
  '

echo ""
echo "[✓] Models are ready in $MODELS_DIR"
echo "You can now start your AI container with: docker compose up -d --build"

