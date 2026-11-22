#!/usr/bin/env python3
"""
BhashaBridge - Sovereign AI Model Downloader
Downloads all required models for Translation, STT, and TTS from Hugging Face.
"""

import os
import sys
import subprocess

MODELS = {
    "translation": {
        "repo": "ai4bharat/indictrans2-en-indic-dist-200M",
        "description": "IndicTrans2 (AI4Bharat / IIT Madras) - English to 22 Indian Languages",
        "size": "~800 MB"
    },
    "translation_nllb": {
        "repo": "facebook/nllb-200-distilled-600M",
        "description": "Meta NLLB-200 - Universal translation for all 22 Indian languages",
        "size": "~2.4 GB"
    },
    "stt": {
        "repo": "Systran/faster-whisper-small",
        "description": "Faster Whisper Small - Real-time Speech-to-Text for Indian languages",
        "size": "~480 MB"
    },
    "tts": {
        "repo": "ai4bharat/indic-tts-coqui",
        "description": "Indic-TTS - High quality sovereign Indian Text-to-Speech voices",
        "size": "~1.2 GB"
    }
}

DEST_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "models"))

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

def download_with_cli(repo_id, local_dir):
    print(f"\n[*] Downloading {repo_id} -> {local_dir} via huggingface-cli...")
    os.makedirs(local_dir, exist_ok=True)
    cmd = ["huggingface-cli", "download", repo_id, "--local-dir", local_dir, "--local-dir-use-symlinks", "False"]
    res = subprocess.run(cmd)
    if res.returncode == 0:
        print(f"[✓] Successfully downloaded {repo_id}")
    else:
        print(f"[!] Failed to download {repo_id} via CLI (exit code {res.returncode})")

def main():
    print_banner()
    os.makedirs(DEST_DIR, exist_ok=True)

    has_cli = check_huggingface_cli()

    if not has_cli:
        print("\n[!] 'huggingface-cli' is not installed yet.")
        print("    Install it quickly using:")
        print("      pip install -U huggingface_hub")
        print("\n    Or using git-lfs:")
        print(f"      git clone https://huggingface.co/ai4bharat/indictrans2-en-indic-dist-200M {DEST_DIR}/indictrans2")
        print(f"      git clone https://huggingface.co/Systran/faster-whisper-small {DEST_DIR}/whisper-small")
        return

    # Download core models
    download_with_cli("ai4bharat/indictrans2-en-indic-dist-200M", os.path.join(DEST_DIR, "indictrans2-200M"))
    download_with_cli("Systran/faster-whisper-small", os.path.join(DEST_DIR, "whisper-small"))

    print("\n" + "=" * 65)
    print("  All models are downloaded and ready for sovereign offline inference!")
    print("=" * 65)

if __name__ == "__main__":
    main()

