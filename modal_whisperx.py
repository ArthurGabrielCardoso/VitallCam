"""
Modal WhisperX Transcription Service
Based on official Modal example (Dec 2024)
"""

import modal
import io

# CUDA setup (official Modal example)
cuda_version = "12.4.0"
flavor = "devel"
operating_sys = "ubuntu22.04"
tag = f"{cuda_version}-{flavor}-{operating_sys}"

# Image setup (official from Modal blog)
image = (
    modal.Image.from_registry(f"nvidia/cuda:{tag}", add_python="3.11")
    .apt_install(
        "git",
        "ffmpeg",
        "pkg-config",
        "build-essential",  # C/C++ compilers (gcc, g++, make)
        "clang",  # Clang compiler for PyAV
        "libavformat-dev",  # FFmpeg libraries for PyAV
        "libavcodec-dev",
        "libavdevice-dev",
        "libavutil-dev",
        "libavfilter-dev",
        "libswscale-dev",
        "libswresample-dev",
    )
    .pip_install(
        "torch==2.0.0",
        "torchaudio==2.0.0",
        "numpy<2.0",
        index_url="https://download.pytorch.org/whl/cu118",
    )
    .pip_install(
        "git+https://github.com/m-bain/whisperx.git@v3.2.0",
        "ffmpeg-python",
        "ctranslate2==4.4.0",
        "fastapi",  # For web endpoint
        "python-multipart",  # Required for FastAPI file uploads
    )
)

app = modal.App("whisperx-transcription", image=image)

# GPU and cache config
GPU_CONFIG = "a10g"  # Using A10G (cheaper than H100)
CACHE_DIR = "/cache"
cache_vol = modal.Volume.from_name("whisperx-model-cache", create_if_missing=True)


@app.cls(
    gpu=GPU_CONFIG,
    volumes={CACHE_DIR: cache_vol},
    scaledown_window=120,  # 2 minutes
    timeout=600,  # 10 minutes
)
class WhisperXModel:
    @modal.enter()
    def setup(self):
        """Load WhisperX model on container startup"""
        import whisperx

        print("Loading WhisperX model...")
        device = "cuda"
        compute_type = "float16"

        # Load model (large-v3 for best quality)
        self.model = whisperx.load_model(
            "large-v3",
            device,
            compute_type=compute_type,
            download_root=CACHE_DIR
        )

        self.device = device
        print("WhisperX model loaded successfully")

    @modal.method()
    def transcribe(self, audio_bytes: bytes, language: str = "pt"):
        """
        Transcribe audio bytes

        Args:
            audio_bytes: Audio file as bytes
            language: Language code (default: pt for Portuguese)

        Returns:
            Dict with transcription result
        """
        import whisperx
        import soundfile as sf
        import numpy as np

        try:
            print(f"Transcribing audio ({len(audio_bytes)} bytes)")

            # Convert bytes to audio array
            audio_buffer = io.BytesIO(audio_bytes)
            audio, sample_rate = sf.read(audio_buffer)

            # Ensure mono
            if len(audio.shape) > 1:
                audio = np.mean(audio, axis=1)

            duration = len(audio) / sample_rate
            print(f"Audio duration: {duration:.2f}s")

            # Transcribe with WhisperX
            batch_size = 16
            result = self.model.transcribe(
                audio,
                batch_size=batch_size,
                language=language
            )

            # Extract text and segments
            segments = result.get("segments", [])
            full_text = " ".join([seg.get("text", "").strip() for seg in segments])

            response = {
                "success": True,
                "text": full_text,
                "segments": [
                    {
                        "text": seg.get("text", "").strip(),
                        "start": seg.get("start", 0.0),
                        "end": seg.get("end", 0.0),
                    }
                    for seg in segments
                ],
                "language": result.get("language", language),
                "duration": duration
            }

            print(f"Transcription complete: {len(segments)} segments")
            return response

        except Exception as e:
            print(f"Transcription error: {e}")
            import traceback
            traceback.print_exc()
            return {
                "success": False,
                "error": str(e),
                "text": "",
                "segments": []
            }


# FastAPI endpoint
@app.function(image=image)
@modal.asgi_app()
def fastapi_app():
    from fastapi import FastAPI, File, UploadFile, Form
    from fastapi.responses import JSONResponse

    web_app = FastAPI(title="WhisperX Transcription API")

    @web_app.post("/transcribe")
    async def transcribe_endpoint(
        audio_file: UploadFile = File(...),
        language: str = Form("pt")
    ):
        """
        Transcribe audio file

        Upload audio file and get transcription in Portuguese
        """
        try:
            print(f"Received file: {audio_file.filename}, language: {language}")

            # Read audio bytes
            audio_data = await audio_file.read()

            # Call WhisperX model
            model = WhisperXModel()
            result = model.transcribe.remote(audio_data, language=language)

            return JSONResponse(content=result)

        except Exception as e:
            print(f"Endpoint error: {e}")
            import traceback
            traceback.print_exc()
            return JSONResponse(
                content={
                    "success": False,
                    "error": str(e),
                    "text": "",
                    "segments": []
                },
                status_code=500
            )

    @web_app.get("/")
    async def root():
        return {
            "service": "WhisperX Transcription",
            "status": "online",
            "model": "large-v3",
            "language": "pt (Portuguese)"
        }

    return web_app
