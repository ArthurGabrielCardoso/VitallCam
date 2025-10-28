"""
WhisperX Transcription Service with Speaker Diarization
Version 3 - Fixed NumPy version pinning to prevent upgrades
"""

import modal
import os

# CUDA setup
cuda_version = "12.4.0"
flavor = "devel"
operating_sys = "ubuntu22.04"
tag = f"{cuda_version}-{flavor}-{operating_sys}"

# Create Modal app with unique name to avoid cache issues
app = modal.App("whisperx-vitallcam-v3")

# Build image with all dependencies
whisperx_image = (
    modal.Image.from_registry(f"nvidia/cuda:{tag}", add_python="3.11")
    .apt_install(
        "git",
        "ffmpeg",
        "build-essential",
        "pkg-config",
        "clang",
        "python3-dev",
        "libavformat-dev",
        "libavcodec-dev",
        "libavdevice-dev",
        "libavutil-dev",
        "libavfilter-dev",
        "libswscale-dev",
        "libswresample-dev",
    )
    # CRITICAL: Install NumPy 1.26.4 FIRST and prevent any upgrades
    .run_commands(
        "pip install 'numpy==1.26.4'",
        "pip freeze | grep numpy",  # Verify NumPy version
    )
    # Install PyTorch with specific NumPy constraint
    .run_commands(
        "pip install torch==2.1.0 torchaudio==2.1.0 --index-url https://download.pytorch.org/whl/cu121 --no-deps",
        "pip install typing-extensions",  # torch dependency
        "pip install sympy",  # torch dependency
        "pip install networkx",  # torch dependency
        "pip install jinja2",  # torch dependency
        "pip install fsspec",  # torch dependency
        "pip install filelock",  # torch dependency
        "pip freeze | grep numpy",  # Verify NumPy still 1.26.4
    )
    # Install build tools
    .pip_install(
        "cython<3.0",
        "av>=11.0.0",
    )
    # Install WhisperX and dependencies with NumPy constraint
    .run_commands(
        "pip install 'git+https://github.com/m-bain/whisperx.git@v3.2.0' --no-deps",
        "pip install ffmpeg-python",
        "pip install ctranslate2==4.4.0",
        "pip install 'fastapi[all]'",
        "pip install python-multipart",
        "pip install soundfile",
        "pip install librosa",
        "pip install more-itertools",
        "pip install transformers",
        "pip install pyannote.audio",
        "pip freeze | grep numpy",  # Final NumPy check
    )
)

# Volume for caching models
CACHE_DIR = "/cache"
cache_volume = modal.Volume.from_name("whisperx-cache-v3", create_if_missing=True)

# Secrets for Hugging Face token (for diarization)
HF_SECRET = modal.Secret.from_name("huggingface-secret", required_keys=["HF_TOKEN"])


@app.cls(
    image=whisperx_image,
    gpu="a10g",
    volumes={CACHE_DIR: cache_volume},
    secrets=[HF_SECRET],
    scaledown_window=300,
    timeout=900,
)
class WhisperXTranscriber:
    """WhisperX transcription with speaker diarization"""

    @modal.enter()
    def load_models(self):
        """Load models on container start"""
        import whisperx
        import torch
        import numpy as np

        print(f"🔍 NumPy version check: {np.__version__}")

        if np.__version__.startswith("2."):
            raise RuntimeError(f"❌ CRITICAL: NumPy 2.x detected ({np.__version__})! Must be 1.26.4")

        print("🚀 Loading WhisperX models...")

        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.compute_type = "float16" if self.device == "cuda" else "int8"

        print(f"Device: {self.device}")
        print(f"Compute type: {self.compute_type}")

        # Load Whisper model
        print(f"Loading Whisper large-v3 on {self.device}...")
        self.model = whisperx.load_model(
            "large-v3",
            self.device,
            compute_type=self.compute_type,
            download_root=CACHE_DIR,
        )

        # Check for HF token for diarization
        self.hf_token = os.environ.get("HF_TOKEN")
        if self.hf_token:
            print("✅ HF token found - diarization enabled")
        else:
            print("⚠️  No HF token - diarization disabled")

        print("✅ Models loaded successfully!")

    @modal.method()
    def transcribe(
        self,
        audio_data: bytes,
        language: str = "pt",
        enable_diarization: bool = True,
        min_speakers: int | None = None,
        max_speakers: int | None = None,
    ):
        """
        Transcribe audio with optional speaker diarization
        """
        import whisperx
        import tempfile

        try:
            print(f"📝 Starting transcription ({len(audio_data)} bytes)")

            # Save audio to temporary file
            with tempfile.NamedTemporaryFile(suffix=".audio", delete=False) as tmp_file:
                tmp_file.write(audio_data)
                tmp_path = tmp_file.name

            # Load audio
            print("Loading audio...")
            audio = whisperx.load_audio(tmp_path)
            duration = len(audio) / 16000
            print(f"Audio duration: {duration:.2f}s")

            # Step 1: Transcribe with Whisper
            print("Step 1: Transcribing with WhisperX...")
            result = self.model.transcribe(
                audio,
                batch_size=16,
                language=language,
            )

            detected_language = result.get("language", language)
            segments = result.get("segments", [])
            print(f"Detected language: {detected_language}")
            print(f"Found {len(segments)} segments")

            if not segments:
                print("⚠️  No speech detected in audio")
                return {
                    "success": True,
                    "text": "",
                    "segments": [],
                    "language": detected_language,
                    "duration": duration,
                    "diarization_enabled": False,
                }

            # Step 2: Align whisper output
            print("Step 2: Aligning timestamps...")
            try:
                model_a, metadata = whisperx.load_align_model(
                    language_code=detected_language,
                    device=self.device,
                )
                result = whisperx.align(
                    result["segments"],
                    model_a,
                    metadata,
                    audio,
                    self.device,
                    return_char_alignments=False,
                )
                segments = result["segments"]
                print(f"✅ Aligned {len(segments)} segments")
            except Exception as e:
                print(f"⚠️  Alignment failed: {e}, continuing without alignment")

            # Step 3: Speaker diarization (if enabled and token available)
            diarization_enabled = False
            if enable_diarization and self.hf_token:
                print("Step 3: Performing speaker diarization...")
                try:
                    diarize_model = whisperx.DiarizationPipeline(
                        use_auth_token=self.hf_token,
                        device=self.device,
                    )

                    diarize_segments = diarize_model(
                        audio,
                        min_speakers=min_speakers,
                        max_speakers=max_speakers,
                    )

                    result = whisperx.assign_word_speakers(diarize_segments, result)
                    segments = result["segments"]
                    diarization_enabled = True
                    print(f"✅ Diarization complete")
                except Exception as e:
                    print(f"⚠️  Diarization failed: {e}, continuing without diarization")

            # Extract full text and format segments
            full_text = " ".join([seg.get("text", "").strip() for seg in segments])

            formatted_segments = []
            for seg in segments:
                formatted_seg = {
                    "text": seg.get("text", "").strip(),
                    "start": seg.get("start", 0.0),
                    "end": seg.get("end", 0.0),
                }
                if "speaker" in seg:
                    formatted_seg["speaker"] = seg["speaker"]

                formatted_segments.append(formatted_seg)

            # Clean up temp file
            try:
                import os
                os.unlink(tmp_path)
            except:
                pass

            response = {
                "success": True,
                "text": full_text,
                "segments": formatted_segments,
                "language": detected_language,
                "duration": duration,
                "diarization_enabled": diarization_enabled,
            }

            print(f"✅ Transcription complete: {len(full_text)} chars")
            return response

        except Exception as e:
            print(f"❌ Transcription error: {e}")
            import traceback
            traceback.print_exc()
            return {
                "success": False,
                "error": str(e),
                "text": "",
                "segments": [],
                "diarization_enabled": False,
            }


# Web endpoint with FastAPI
@app.function(
    image=whisperx_image,
    secrets=[HF_SECRET],
)
@modal.asgi_app()
def fastapi_app():
    """FastAPI endpoint for transcription"""
    from fastapi import FastAPI, File, UploadFile, Form
    from fastapi.responses import JSONResponse
    from fastapi.middleware.cors import CORSMiddleware

    web_app = FastAPI(
        title="WhisperX Transcription API",
        description="Real-time transcription with speaker diarization",
        version="3.0",
    )

    # CORS
    web_app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @web_app.get("/")
    async def root():
        """Health check"""
        hf_token_available = bool(os.environ.get("HF_TOKEN"))
        return {
            "service": "WhisperX Transcription API",
            "status": "online",
            "version": "3.0",
            "model": "large-v3",
            "diarization": "enabled" if hf_token_available else "disabled (no HF token)",
            "language": "pt (Portuguese)",
        }

    @web_app.post("/transcribe")
    async def transcribe_endpoint(
        audio_file: UploadFile = File(...),
        language: str = Form("pt"),
        enable_diarization: str = Form("true"),
        min_speakers: int | None = Form(None),
        max_speakers: int | None = Form(None),
    ):
        """Transcribe audio file with speaker diarization"""
        try:
            print(f"📥 Received file: {audio_file.filename}")

            # Read audio data
            audio_data = await audio_file.read()
            print(f"Audio size: {len(audio_data)} bytes")

            # Parse diarization flag
            enable_diarization_bool = enable_diarization.lower() in ["true", "1", "yes"]

            # Call transcription model
            transcriber = WhisperXTranscriber()
            result = transcriber.transcribe.remote(
                audio_data=audio_data,
                language=language,
                enable_diarization=enable_diarization_bool,
                min_speakers=min_speakers,
                max_speakers=max_speakers,
            )

            return JSONResponse(content=result)

        except Exception as e:
            print(f"❌ Endpoint error: {e}")
            import traceback
            traceback.print_exc()
            return JSONResponse(
                content={
                    "success": False,
                    "error": str(e),
                    "text": "",
                    "segments": [],
                },
                status_code=500,
            )

    @web_app.get("/health")
    async def health():
        """Detailed health check"""
        import torch
        import numpy as np

        return {
            "status": "healthy",
            "cuda_available": torch.cuda.is_available(),
            "hf_token_configured": bool(os.environ.get("HF_TOKEN")),
            "numpy_version": np.__version__,
        }

    return web_app


# Local testing
@app.local_entrypoint()
def main():
    """Test transcription locally"""
    print("Testing WhisperX transcription...")
    print("Deploy with: modal deploy modal_whisperx_v3.py")
    print("Then test at: https://<your-username>--whisperx-vitallcam-v3-fastapi-app.modal.run/")
