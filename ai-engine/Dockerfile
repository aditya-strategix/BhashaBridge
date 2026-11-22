FROM pytorch/pytorch:2.3.0-cuda12.1-cudnn8-runtime

WORKDIR /app

# Install system audio, git, and compilation libraries
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ffmpeg \
    libsndfile1 \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

ENV PIP_DEFAULT_TIMEOUT=1000 \
    PIP_RETRIES=10

COPY requirements.txt .
RUN pip install --no-cache-dir -U "protobuf>=4.25.3,<5.0.0" && pip install --no-cache-dir -r requirements.txt

COPY app.py .

# Expose FastAPI port
EXPOSE 8000

ENV MODELS_DIR=/app/models

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]

