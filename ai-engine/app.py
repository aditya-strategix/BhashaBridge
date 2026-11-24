import os
import io
import time
import threading
import torch
import numpy as np
import soundfile as sf
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response, JSONResponse
from pydantic import BaseModel
from typing import Optional, List

app = FastAPI(title="BhashaBridge Sovereign AI Inference Engine", version="2.0.0")

MODELS_DIR = os.getenv("MODELS_DIR", "/app/models")
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
# Single source of truth for the TTS precision. Keeping every sub-module on the
# same dtype is critical: ParlerTTS embeds a FLAN-T5 text encoder whose layer
# norm promotes activations to the module dtype, and a partially-cast module
# makes it build float32 attention masks that crash the fp16 matmuls.
TTS_DTYPE = torch.float16 if DEVICE == "cuda" else torch.float32
# Neural synthesis is not re-entrant: a single GPU model shared by FastAPI's
# worker threads must not be invoked concurrently.
tts_lock = threading.Lock()
whisper_lock = threading.Lock()
# Re-entrant: get_indictrans() also takes this lock while loading, and the whole
# translate pipeline (preprocess → tokenize → generate → postprocess) must be
# serialised because IndicTransTokenizer mutates its own vocab/mode.
indictrans_lock = threading.RLock()
_indictrans_processor = None
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

def _norm_lang(code: str) -> str:
    """Normalise a locale (``ta-IN``, ``TA``) to an ISO-639-1 key."""
    return (code or "").strip().lower().replace("_", "-").split("-")[0]


def _indic_tag(code: str, default: str) -> str:
    """Resolve an ISO/Bhashini language code to an IndicTrans2 language tag."""
    raw = (code or "").strip().lower()
    return INDIC_LANG_MAP.get(raw) or INDIC_LANG_MAP.get(_norm_lang(raw)) or default


def get_indic_processor():
    """Lazy-load IndicTransToolkit's pre/post processor.

    IndicTrans2's target vocabulary is Devanagari-based; ``postprocess_batch``
    transliterates decoded text into the requested target script (Tamil,
    Telugu, Bengali, ...). Without it every non-Hindi target comes out in
    Devanagari. The engine still works (Hindi-only quality) if the optional
    dependency is missing.
    """
    global _indictrans_processor
    if _indictrans_processor is None:
        try:
            from IndicTransToolkit.processor import IndicProcessor
            _indictrans_processor = IndicProcessor(inference=True)
            print("[IndicTrans2] IndicProcessor pre/post-processing enabled")
        except Exception as exc:
            print(f"[IndicTrans2] IndicProcessor unavailable ({exc}); target-script conversion disabled")
            _indictrans_processor = False
    return _indictrans_processor or None


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
                torch_dtype=TTS_DTYPE
            )
            # Force a uniform dtype across the decoder AND the text encoder.
            # from_pretrained can leave some sub-modules in the checkpoint dtype
            # (float32) while casting the rest, which breaks fp16 inference.
            tts_model = tts_model.to(device=DEVICE, dtype=TTS_DTYPE)
            tts_model.eval()
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

            print(
                "[Bhashini Indic-TTS] Model loaded successfully into VRAM! "
                f"dtype={next(tts_model.parameters()).dtype} device={next(tts_model.parameters()).device}"
            )
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
        with whisper_lock:
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
        with indictrans_lock:
            if indictrans_model is None:
                from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
                trans_path = os.path.join(MODELS_DIR, "indictrans2-200M")
                model_source = trans_path if os.path.exists(trans_path) else "ai4bharat/indictrans2-en-indic-dist-200M"
                print(f"[IndicTrans2] Loading from {model_source} on {DEVICE}...")
                indictrans_tokenizer = AutoTokenizer.from_pretrained(model_source, trust_remote_code=True)
                indictrans_model = AutoModelForSeq2SeqLM.from_pretrained(
                    model_source,
                    trust_remote_code=True,
                    torch_dtype=torch.float32
                ).to(DEVICE)
                indictrans_model.eval()
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


@app.get("/v1/models")
def list_models():
    """OpenAI-compatible model listing (used by health probes)."""
    return {
        "object": "list",
        "data": [
            {"id": "bhashabridge-sovereign", "object": "model", "owned_by": "bhashabridge"},
            {"id": "indic-parler-tts", "object": "model", "owned_by": "bhashabridge"},
            {"id": "indictrans2-200M", "object": "model", "owned_by": "bhashabridge"},
            {"id": "whisper-small", "object": "model", "owned_by": "bhashabridge"}
        ]
    }

# --- A. TRANSLATION (IndicTrans2) ---
@app.post("/translate")
def translate(req: TranslateRequest):
    text = (req.text or "").strip()
    if not text:
        return {"translated_text": req.text, "source_language": req.source_language, "target_language": req.target_language}

    t0 = time.time()
    try:
        src_tag = _indic_tag(req.source_language, "eng_Latn")
        tgt_tag = _indic_tag(req.target_language, "hin_Deva")

        # This deployment ships the English→Indic checkpoint. Feeding it a
        # non-English source produces transliterated garbage, so reject it
        # explicitly and let the caller pivot/fall back instead.
        if src_tag != "eng_Latn":
            raise HTTPException(
                status_code=422,
                detail=f"Source '{req.source_language}' is not supported by the English→Indic engine"
            )

        # IndicTransTokenizer mutates its own vocab/mode and IndicProcessor is
        # not safe to call concurrently, so the whole pipeline (load →
        # preprocess → tokenize → generate → postprocess) is serialised.
        with indictrans_lock:
            tokenizer, model = get_indictrans()
            processor = get_indic_processor()
            if processor is not None:
                batch = processor.preprocess_batch([text], src_lang=src_tag, tgt_lang=tgt_tag)
            else:
                # IndicTrans2 input format: "<src_lang> <tgt_lang> <text>"
                batch = [f"{src_tag} {tgt_tag} {text}"]

            inputs = tokenizer(
                batch,
                return_tensors="pt",
                truncation=True,
                max_length=256,
            ).to(DEVICE)
            with torch.inference_mode():
                outputs = model.generate(
                    **inputs,
                    max_length=256,
                    num_beams=4,
                    early_stopping=True,
                )
            translated = tokenizer.decode(
                outputs[0],
                skip_special_tokens=True,
                clean_up_tokenization_spaces=True,
            ).strip()

            if processor is not None:
                translated = processor.postprocess_batch([translated], lang=tgt_tag)[0]

        latency = int((time.time() - t0) * 1000)
        return {
            "translated_text": translated,
            "source_language": req.source_language,
            "target_language": req.target_language,
            "latency_ms": latency
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Translation Error] {e}")
        # Never report a failed translation as a successful 200 with the source
        # text echoed back: callers cache that as a real translation.
        raise HTTPException(status_code=503, detail=f"Translation failed: {e}")

# --- B. SPEECH-TO-TEXT (Faster-Whisper) ---
def _run_whisper(audio_bytes: bytes, transcribe_kwargs: dict):
    """Blocking Whisper inference, executed in a worker thread.

    faster-whisper models are not safe for concurrent calls, and lazily
    iterating the segment generator is part of the blocking work.
    """
    # Load outside the inference lock: get_whisper() takes the same lock while
    # initialising, and threading.Lock is not re-entrant.
    model = get_whisper()
    with whisper_lock:
        segments, info = model.transcribe(io.BytesIO(audio_bytes), **transcribe_kwargs)
        text = " ".join([seg.text for seg in segments]).strip()
    return text, info


@app.post("/v1/audio/transcriptions")
async def transcribe(
    request: Request,
    file: Optional[UploadFile] = File(None),
    language: Optional[str] = Form(None)
):
    t0 = time.time()
    try:
        if file:
            audio_bytes = await file.read()
        else:
            audio_bytes = await request.body()

        if not audio_bytes or len(audio_bytes) == 0:
            raise HTTPException(status_code=400, detail="No audio data provided")

        transcribe_kwargs = {"beam_size": 2}
        requested_lang = _norm_lang(language) if language else ""
        if requested_lang and requested_lang != "auto":
            transcribe_kwargs["language"] = requested_lang

        # Offload GPU/CPU work so /health and /tts keep responding.
        text, info = await run_in_threadpool(_run_whisper, audio_bytes, transcribe_kwargs)

        return {
            "text": text,
            "language": requested_lang or info.language,
            "detected_language": info.language,
            "duration": getattr(info, 'duration', 0.0),
            "latency_ms": int((time.time() - t0) * 1000)
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"[STT Error] {e}")
        raise HTTPException(status_code=503, detail=f"Transcription failed: {e}")

# --- C. TEXT-TO-SPEECH (Neural Parler-TTS / Sovereign WAV Synthesis) ---
def _encode_wav(audio, sample_rate: int) -> bytes:
    """Encode a float waveform (fp16/fp32/fp64) as 16-bit PCM WAV bytes."""
    audio_np = np.asarray(audio, dtype=np.float32).reshape(-1)
    wav_io = io.BytesIO()
    sf.write(wav_io, audio_np, sample_rate, format='WAV', subtype='PCM_16')
    return wav_io.getvalue()


def _generate_parler_audio(text: str, tokenizer, model, gender: str = "female"):
    """Run Parler-TTS generation defensively.

    The T5 text encoder promotes its activations using the module dtype. If the
    loaded checkpoint is only *partially* cast to fp16, that promotion produces
    float32 activations while the FFN weights stay fp16, raising
    ``expected mat1 and mat2 to have the same dtype``. Autocast keeps the
    matmuls in fp16; if we still hit a dtype error we re-normalise the model to
    one dtype and retry once instead of degrading to a synthetic tone.
    """
    voice_gender = "male" if (gender or "").lower().startswith("m") else "female"
    desc = f"A clear and natural Indian {voice_gender} voice delivering fluent speech."
    desc_tok = tts_desc_tokenizer if tts_desc_tokenizer is not None else tokenizer
    desc_tokens = desc_tok(desc, return_tensors="pt").to(DEVICE)
    prompt_tokens = tokenizer(text, return_tensors="pt").to(DEVICE)

    gen_kwargs = dict(
        input_ids=desc_tokens.input_ids,
        attention_mask=desc_tokens.attention_mask,
        prompt_input_ids=prompt_tokens.input_ids,
        prompt_attention_mask=prompt_tokens.attention_mask,
    )
    use_autocast = DEVICE == "cuda" and TTS_DTYPE == torch.float16

    def _run():
        with torch.inference_mode():
            if use_autocast:
                with torch.autocast(device_type="cuda", dtype=torch.float16):
                    return model.generate(**gen_kwargs)
            return model.generate(**gen_kwargs)

    try:
        return _run()
    except RuntimeError as exc:
        message = str(exc)
        if "same dtype" not in message and "expected scalar type" not in message:
            raise
        print(f"[Bhashini Indic-TTS] dtype mismatch, re-normalising model to {TTS_DTYPE}: {message}")
        model.to(device=DEVICE, dtype=TTS_DTYPE)
        return _run()


@app.post("/tts")
def synthesize_tts(req: TTSRequest):
    if not req.text or not req.text.strip():
        raise HTTPException(status_code=400, detail="Empty text")

    try:
        # Serialise access to the shared GPU model across FastAPI worker threads.
        with tts_lock:
            tokenizer, model = get_tts()

            # Check whether model is ParlerTTS or VitsModel
            is_parler = "ParlerTTS" in type(model).__name__

            if is_parler:
                generation = _generate_parler_audio(req.text.strip(), tokenizer, model, req.gender)
                audio = generation.float().cpu().numpy().squeeze()
                audio_encoder_cfg = getattr(model.config, 'audio_encoder', None)
                sample_rate = int(getattr(model.config, 'sampling_rate',
                                          getattr(audio_encoder_cfg, 'sampling_rate', 44100)))
            else:
                inputs = tokenizer(req.text, return_tensors="pt").to(DEVICE)
                with torch.inference_mode():
                    output = model(**inputs).waveform
                audio = output[0].float().cpu().numpy().squeeze()
                sample_rate = int(getattr(model.config, 'sampling_rate', 22050))

        audio = np.asarray(audio, dtype=np.float32).reshape(-1)
        if audio.size == 0 or not np.all(np.isfinite(audio)):
            raise RuntimeError("Neural TTS produced empty or non-finite audio")

        # Guard against clipping without altering the voice.
        peak = float(np.max(np.abs(audio)))
        if peak > 1.0:
            audio = audio / peak

        wav_bytes = _encode_wav(audio, sample_rate)
        if len(wav_bytes) <= 44:
            raise RuntimeError("Neural TTS produced a silent waveform")

        return Response(
            content=wav_bytes,
            media_type="audio/wav",
            headers={
                "X-TTS-Engine": "Bhashini-IndicTTS-Neural",
                "Content-Length": str(len(wav_bytes))
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[Neural TTS failure] {e}")
        # Never fake speech with a beep/tone: fail loudly so the caller can fall
        # back to a real voice engine instead of playing a meaningless sound.
        raise HTTPException(
            status_code=503,
            detail=f"Neural TTS synthesis failed: {e}"
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=False)
