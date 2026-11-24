#!/usr/bin/env python3
"""
BhashaBridge - Sovereign AI Model Downloader

Downloads the models actually loaded by ai-engine/app.py into
ai-engine/models (the host directory bind-mounted at /app/models).
"""

import os
import subprocess

# Keep these names in sync with MODELS_DIR lookups in ai-engine/app.py.
MODELS = {
    "translation": {
        "repo": "ai4bharat/indictrans2-en-indic-dist-200M",
        "local": "indictrans2-200M",
        "description": "IndicTrans2 (AI4Bharat / IIT Madras) - English to 22 Indian Languages",
        "size": "~1.1 GB",
        "gated": True,
    },
    "stt": {
        "repo": "Systran/faster-whisper-small",
        "local": "whisper-small",
        "description": "Faster Whisper Small - Real-time Speech-to-Text",
        "size": "~480 MB",
    },
    "tts": {
        "repo": "ai4bharat/indic-parler-tts",
        "local": "indic-parler-tts",
        "description": "Bhashini Indic Parler-TTS voice synthesis",
        "size": "~5 GB",
    },
    "tts_tokenizer": {
        "repo": "google/flan-t5-large",
        "local": "flan-t5-large",
        "description": "FLAN-T5 text encoder tokens for Parler-TTS descriptions",
        "size": "~3 GB",
        "allow_patterns": ["tokenizer*", "spiece.model", "special_tokens_map.json", "config.json"],
    },
}

DEST_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "ai-engine", "models")
)


def print_banner():
    print("=" * 65)
    print("  BhashaBridge Sovereign AI - Hugging Face Model Downloader")
    print("=" * 65)
    print(f"Target Directory: {DEST_DIR}\n")
    print("Models to be downloaded:")
    for key, info in MODELS.items():
        print(f"  • [{key.upper()}]: {info['repo']} ({info['size']})")
        print(f"    {info['description']}")
    print("=" * 65)


def check_huggingface_cli():
    try:
        subprocess.run(["huggingface-cli", "--help"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        return True
    except (FileNotFoundError, subprocess.CalledProcessError):
        return False


def download_with_cli(info):
    repo_id = info["repo"]
    local_dir = os.path.join(DEST_DIR, info["local"])
    print(f"\n[*] Downloading {repo_id} -> {local_dir}...")
    os.makedirs(local_dir, exist_ok=True)
    cmd = ["huggingface-cli", "download", repo_id, "--local-dir", local_dir]
    for pattern in info.get("allow_patterns", []):
        cmd.extend(["--include", pattern])
    res = subprocess.run(cmd)
    if res.returncode == 0:
        print(f"[✓] Successfully downloaded {repo_id}")
    else:
        print(f"[!] Failed to download {repo_id} (exit code {res.returncode})")
        if info.get("gated"):
            print("    This repository is gated: export HF_TOKEN=<your token> first.")


def main():
    print_banner()
    os.makedirs(DEST_DIR, exist_ok=True)

    if not check_huggingface_cli():
        print("\n[!] 'huggingface-cli' is not installed yet.")
        print("    Install it with: pip install -U huggingface_hub")
        return

    for info in MODELS.values():
        download_with_cli(info)

    print("\n" + "=" * 65)
    print("  All required models are downloaded into ai-engine/models")
    print("=" * 65)


if __name__ == "__main__":
    main()
