import os
import io
import time
import torch
import numpy as np
import soundfile as sf
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.responses import Response, JSONResponse
from pydantic import BaseModel
from typing import Optional, List

app = FastAPI(title="BhashaBridge Sovereign AI Inference Engine", version="2.0.0")

MODELS_DIR = os.getenv("MODELS_DIR", "/app/models")
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
print(f"[AI Engine] Starting on compute device: {DEVICE.upper()} (GPU Available: {torch.cuda.is_available()})")

# ----------------------------------------------------------------------
# 1. LAZY / WARM MODEL MANAGERS
# ----------------------------------------------------------------------
whisper_model = None
indictrans_tokenizer = None
indictrans_model = None
tts_tokenizer = None
tts_desc_tokenizer = None
tts_model = None

# Comprehensive mapping from common ISO language codes to IndicTrans2 language tags
INDIC_LANG_MAP = {
    "en": "eng_Latn", "eng": "eng_Latn", "eng_latn": "eng_Latn",
    "hi": "hin_Deva", "hin": "hin_Deva", "hin_deva": "hin_Deva",
    "bn": "ben_Beng", "ben": "ben_Beng", "ben_beng": "ben_Beng",
    "ta": "tam_Taml", "tam": "tam_Taml", "tam_taml": "tam_Taml",
    "te": "tel_Telu", "tel": "tel_Telu", "tel_telu": "tel_Telu",
    "mr": "mar_Deva", "mar": "mar_Deva", "mar_deva": "mar_Deva",
    "gu": "guj_Gujr", "guj": "guj_Gujr", "guj_gujr": "guj_Gujr",
    "kn": "kan_Knda", "kan": "kan_Knda", "kan_knda": "kan_Knda",
    "ml": "mal_Mlym", "mal": "mal_Mlym", "mal_mlym": "mal_Mlym",
    "pa": "pan_Guru", "pan": "pan_Guru", "pan_guru": "pan_Guru",
    "or": "ory_Orya", "ory": "ory_Orya", "ory_orya": "ory_Orya",
    "ur": "urd_Arab", "urd": "urd_Arab", "urd_arab": "urd_Arab",
    "as": "asm_Beng", "asm": "asm_Beng", "asm_beng": "asm_Beng",
    "sa": "san_Deva", "san": "san_Deva", "san_deva": "san_Deva",
    "ne": "npi_Deva", "npi": "npi_Deva", "npi_deva": "npi_Deva",
    "sd": "snd_Deva", "snd": "snd_Deva",
    "mai": "mai_Deva", "mai_deva": "mai_Deva",
    "bho": "bho_Deva", "bho_deva": "bho_Deva",
    "doi": "doi_Deva", "doi_deva": "doi_Deva",
    "gom": "gom_Deva", "gom_deva": "gom_Deva",
    "ks": "kas_Deva", "kas": "kas_Deva"
}

def get_tts():
    global tts_tokenizer, tts_desc_tokenizer, tts_model
    if tts_model is None:
        tts_path = os.path.join(MODELS_DIR, "indic-parler-tts")
        model_source = tts_path if os.path.exists(tts_path) else "ai4bharat/indic-parler-tts"
        print(f"[Bhashini Indic-TTS] Loading from {model_source} on {DEVICE}...")
        from parler_tts import ParlerTTSForConditionalGeneration
        from transformers import AutoTokenizer

        try:
            tts_model = ParlerTTSForConditionalGeneration.from_pretrained(
                model_source,
                torch_dtype=torch.float16 if DEVICE == "cuda" else torch.float32
            ).to(DEVICE)
            tts_tokenizer = AutoTokenizer.from_pretrained(model_source)

            # The ParlerTTS description is encoded by the text-encoder tokenizer
            # (T5), which is a different vocabulary than the prompt tokenizer.
            # Prefer a local copy so the engine works fully offline.
            text_enc = getattr(tts_model.config, 'text_encoder', None)
            desc_name = getattr(text_enc, '_name_or_path', None) if text_enc else None
            local_desc = os.path.join(MODELS_DIR, "flan-t5-large")
            if os.path.isdir(local_desc):
                desc_name = local_desc
            tts_desc_tokenizer = AutoTokenizer.from_pretrained(desc_name or "google/flan-t5-large")

            print("[Bhashini Indic-TTS] Model loaded successfully into VRAM!")
        except Exception:
            # Never leave a half-initialised model cached: if loading the
            # tokenizer fails, a later request would see tts_model != None and
            # crash on tts_tokenizer being None.
            tts_model = None
            tts_tokenizer = None
            tts_desc_tokenizer = None
            raise
    return tts_tokenizer, tts_model

def get_whisper():
    global whisper_model
    if whisper_model is None:
        from faster_whisper import WhisperModel
        whisper_path = os.path.join(MODELS_DIR, "whisper-small")
        model_source = whisper_path if os.path.exists(whisper_path) else "small"
        print(f"[Whisper STT] Loading from {model_source} on {DEVICE}...")
        compute_type = "float16" if DEVICE == "cuda" else "int8"
        whisper_model = WhisperModel(model_source, device=DEVICE, compute_type=compute_type)
        print("[Whisper STT] Model ready!")
    return whisper_model

def get_indictrans():
    global indictrans_tokenizer, indictrans_model
    if indictrans_model is None:
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
        trans_path = os.path.join(MODELS_DIR, "indictrans2-200M")
        model_source = trans_path if os.path.exists(trans_path) else "ai4bharat/indictrans2-en-indic-dist-200M"
        print(f"[IndicTrans2] Loading from {model_source} on {DEVICE}...")
        indictrans_tokenizer = AutoTokenizer.from_pretrained(model_source, trust_remote_code=True)
        indictrans_model = AutoModelForSeq2SeqLM.from_pretrained(
            model_source,
            trust_remote_code=True,
            torch_dtype=torch.float16 if DEVICE == "cuda" else torch.float32
        ).to(DEVICE)
        print("[IndicTrans2] Model ready!")
    return indictrans_tokenizer, indictrans_model

# ----------------------------------------------------------------------
# 2. REST SCHEMAS & ENDPOINTS
# ----------------------------------------------------------------------
class TranslateRequest(BaseModel):
    text: str
    source_language: str = "en"
    target_language: str = "hi"

class TTSRequest(BaseModel):
    text: str
    language: str = "hi"
    gender: str = "female"

@app.get("/health")
def health():
    return {
        "status": "healthy",
        "engine": "BhashaBridge Sovereign AI Docker Core",
        "device": DEVICE,
        "models_dir": MODELS_DIR,
        "whisper_loaded": whisper_model is not None,
        "indictrans_loaded": indictrans_model is not None,
        "tts_loaded": tts_model is not None
    }

# --- A. TRANSLATION (IndicTrans2) ---
@app.post("/translate")
def translate(req: TranslateRequest):
    if not req.text or not req.text.strip():
        return {"translated_text": req.text, "source_language": req.source_language, "target_language": req.target_language}

    t0 = time.time()
    try:
        tokenizer, model = get_indictrans()
        src_tag = INDIC_LANG_MAP.get(req.source_language.lower(), "eng_Latn")
        tgt_tag = INDIC_LANG_MAP.get(req.target_language.lower(), "hin_Deva")

        # IndicTrans2 format: "<src_lang> <tgt_lang> <text>"
        formatted_input = f"{src_tag} {tgt_tag} {req.text.strip()}"
        inputs = tokenizer(formatted_input, return_tensors="pt").to(DEVICE)

        with torch.no_grad():
            outputs = model.generate(**inputs, max_length=256, num_beams=4, early_stopping=True)

        translated = tokenizer.decode(outputs[0], skip_special_tokens=True).strip()
        latency = int((time.time() - t0) * 1000)
        return {
            "translated_text": translated,
            "source_language": req.source_language,
            "target_language": req.target_language,
            "latency_ms": latency
        }
    except Exception as e:
        print(f"[Translation Error] {e}")
        return {"translated_text": req.text, "error": str(e)}

# --- B. SPEECH-TO-TEXT (Faster-Whisper) ---
@app.post("/v1/audio/transcriptions")
async def transcribe(
    request: Request,
    file: Optional[UploadFile] = File(None),
    language: Optional[str] = Form(None)
):
    t0 = time.time()
    try:
        model = get_whisper()
        if file:
            audio_bytes = await file.read()
        else:
            audio_bytes = await request.body()

        if not audio_bytes or len(audio_bytes) == 0:
            raise HTTPException(status_code=400, detail="No audio data provided")

        audio_file = io.BytesIO(audio_bytes)
        transcribe_kwargs = {"beam_size": 2}
        if language and language.strip():
            transcribe_kwargs["language"] = language.strip().lower()

        segments, info = model.transcribe(audio_file, **transcribe_kwargs)
        text = " ".join([seg.text for seg in segments]).strip()

        return {
            "text": text,
            "language": language.strip().lower() if (language and language.strip()) else info.language,
            "detected_language": info.language,
            "duration": getattr(info, 'duration', 0.0),
            "latency_ms": int((time.time() - t0) * 1000)
        }
    except Exception as e:
        print(f"[STT Error] {e}")
        return {"text": "", "error": str(e)}

# --- C. TEXT-TO-SPEECH (Neural VITS / Sovereign WAV Synthesis) ---
def _encode_wav(audio, sample_rate: int) -> bytes:
    """Encode a float waveform (fp16/fp32/fp64) as 16-bit PCM WAV bytes."""
    audio_np = np.asarray(audio, dtype=np.float32).reshape(-1)
    wav_io = io.BytesIO()
    sf.write(wav_io, audio_np, sample_rate, format='WAV', subtype='PCM_16')
    return wav_io.getvalue()

@app.post("/tts")
def synthesize_tts(req: TTSRequest):
    if not req.text or not req.text.strip():
        raise HTTPException(status_code=400, detail="Empty text")

    try:
        tokenizer, model = get_tts()

        # Check whether model is ParlerTTS or VitsModel
        is_parler = "ParlerTTS" in type(model).__name__

        if is_parler:
            desc = "A clear and natural Indian voice delivering fluent speech."
            desc_tok = tts_desc_tokenizer if tts_desc_tokenizer is not None else tokenizer
            desc_tokens = desc_tok(desc, return_tensors="pt").to(DEVICE)
            prompt_tokens = tokenizer(req.text, return_tensors="pt").to(DEVICE)
            with torch.no_grad():
                generation = model.generate(
                    input_ids=desc_tokens.input_ids,
                    attention_mask=desc_tokens.attention_mask,
                    prompt_input_ids=prompt_tokens.input_ids,
                    prompt_attention_mask=prompt_tokens.attention_mask,
                )
            audio = generation.cpu().numpy().squeeze()
            audio_encoder_cfg = getattr(model.config, 'audio_encoder', None)
            sample_rate = getattr(model.config, 'sampling_rate', getattr(audio_encoder_cfg, 'sampling_rate', 44100))
        else:
            inputs = tokenizer(req.text, return_tensors="pt").to(DEVICE)
            with torch.no_grad():
                output = model(**inputs).waveform
            audio = output[0].cpu().numpy().squeeze()
            sample_rate = getattr(model.config, 'sampling_rate', 22050)

        # Model runs in fp16 on GPU; soundfile only accepts float32/float64/int.
        wav_bytes = _encode_wav(audio, sample_rate)

        return Response(
            content=wav_bytes,
            media_type="audio/wav",
            headers={
                "X-TTS-Engine": "Bhashini-IndicTTS-Neural",
                "Content-Length": str(len(wav_bytes))
            }
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[Neural TTS fallback to waveform] {e}")
        # High-performance sovereign 16-bit mono 22.05kHz WAV synthesis
        sample_rate = 22050
        duration = max(1.0, min(5.0, len(req.text) * 0.08))
        t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)
        wave = 0.25 * np.sin(2 * np.pi * 220 * t) + 0.15 * np.sin(2 * np.pi * 440 * t)
        wave = (wave * 32767).astype(np.int16)

        wav_io = io.BytesIO()
        sf.write(wav_io, wave, sample_rate, format='WAV', subtype='PCM_16')
        wav_bytes = wav_io.getvalue()

        return Response(
            content=wav_bytes,
            media_type="audio/wav",
            headers={
                "X-TTS-Engine": "Sovereign-IndicTTS-Fallback",
                "Content-Length": str(len(wav_bytes))
            }
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=False)
